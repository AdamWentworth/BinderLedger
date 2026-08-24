package scan

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const MaxImageBytes int64 = 12 * 1024 * 1024

var (
	ErrImageTooLarge    = errors.New("scan image is too large")
	ErrSessionNotFound  = errors.New("scan session was not found")
	ErrUnsupportedImage = errors.New("scan image must be a valid JPEG or PNG")
)

type Upload struct {
	Side   string
	Reader io.Reader
}

type Image struct {
	ID       int64  `json:"id"`
	Side     string `json:"side"`
	MIMEType string `json:"mimeType"`
	ByteSize int64  `json:"byteSize"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	SHA256   string `json:"sha256"`

	storageKey string
}

type Session struct {
	ID             string    `json:"id"`
	Status         string    `json:"status"`
	ClientPlatform string    `json:"clientPlatform"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
	Images         []Image   `json:"images"`
}

type Store interface {
	Create(context.Context, string, []Upload) (Session, error)
	Get(context.Context, string) (Session, error)
}

type Repository struct {
	db        *pgxpool.Pool
	directory string
}

func NewRepository(db *pgxpool.Pool, directory string) *Repository {
	return &Repository{db: db, directory: directory}
}

func (r *Repository) Create(ctx context.Context, platform string, uploads []Upload) (Session, error) {
	id, err := newID()
	if err != nil {
		return Session{}, fmt.Errorf("generate scan id: %w", err)
	}
	if err := os.MkdirAll(r.directory, 0o750); err != nil {
		return Session{}, fmt.Errorf("create scan image directory: %w", err)
	}
	temporaryDirectory, err := os.MkdirTemp(r.directory, ".upload-")
	if err != nil {
		return Session{}, fmt.Errorf("create temporary scan directory: %w", err)
	}
	defer os.RemoveAll(temporaryDirectory)

	images := make([]Image, 0, len(uploads))
	for _, upload := range uploads {
		image, err := prepareImage(temporaryDirectory, id, upload)
		if err != nil {
			return Session{}, err
		}
		images = append(images, image)
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return Session{}, fmt.Errorf("begin scan transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	session := Session{
		ID:             id,
		Status:         "captured",
		ClientPlatform: platform,
		Images:         images,
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO card_scan_sessions (id, status, client_platform)
		VALUES ($1, $2, $3)
		RETURNING created_at, updated_at
	`, session.ID, session.Status, session.ClientPlatform).Scan(&session.CreatedAt, &session.UpdatedAt)
	if err != nil {
		return Session{}, fmt.Errorf("insert scan session: %w", err)
	}

	for index := range session.Images {
		item := &session.Images[index]
		err = tx.QueryRow(ctx, `
			INSERT INTO card_scan_images (
				scan_session_id, side, storage_key, mime_type,
				byte_size, width, height, sha256
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id
		`, session.ID, item.Side, item.storageKey, item.MIMEType,
			item.ByteSize, item.Width, item.Height, item.SHA256).Scan(&item.ID)
		if err != nil {
			return Session{}, fmt.Errorf("insert %s scan image: %w", item.Side, err)
		}
	}

	finalDirectory := filepath.Join(r.directory, id)
	if err := os.Rename(temporaryDirectory, finalDirectory); err != nil {
		return Session{}, fmt.Errorf("publish scan images: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = os.RemoveAll(finalDirectory)
		}
	}()
	if err := tx.Commit(ctx); err != nil {
		return Session{}, fmt.Errorf("commit scan session: %w", err)
	}
	committed = true
	return session, nil
}

func (r *Repository) Get(ctx context.Context, id string) (Session, error) {
	var session Session
	err := r.db.QueryRow(ctx, `
		SELECT id, status, client_platform, created_at, updated_at
		FROM card_scan_sessions
		WHERE id = $1
	`, id).Scan(
		&session.ID,
		&session.Status,
		&session.ClientPlatform,
		&session.CreatedAt,
		&session.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrSessionNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("get scan session: %w", err)
	}

	rows, err := r.db.Query(ctx, `
		SELECT id, side, mime_type, byte_size, width, height, sha256, storage_key
		FROM card_scan_images
		WHERE scan_session_id = $1
		ORDER BY CASE side WHEN 'front' THEN 1 ELSE 2 END
	`, id)
	if err != nil {
		return Session{}, fmt.Errorf("get scan images: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var item Image
		if err := rows.Scan(
			&item.ID,
			&item.Side,
			&item.MIMEType,
			&item.ByteSize,
			&item.Width,
			&item.Height,
			&item.SHA256,
			&item.storageKey,
		); err != nil {
			return Session{}, fmt.Errorf("scan image row: %w", err)
		}
		session.Images = append(session.Images, item)
	}
	if err := rows.Err(); err != nil {
		return Session{}, fmt.Errorf("scan image rows: %w", err)
	}
	return session, nil
}

func prepareImage(directory, sessionID string, upload Upload) (Image, error) {
	if upload.Side != "front" && upload.Side != "back" {
		return Image{}, fmt.Errorf("invalid scan image side %q", upload.Side)
	}
	data, err := io.ReadAll(io.LimitReader(upload.Reader, MaxImageBytes+1))
	if err != nil {
		return Image{}, fmt.Errorf("read %s scan image: %w", upload.Side, err)
	}
	if int64(len(data)) > MaxImageBytes {
		return Image{}, ErrImageTooLarge
	}

	mimeType := http.DetectContentType(data)
	extension := ""
	switch mimeType {
	case "image/jpeg":
		extension = ".jpg"
	case "image/png":
		extension = ".png"
	default:
		return Image{}, ErrUnsupportedImage
	}
	configuration, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || configuration.Width <= 0 || configuration.Height <= 0 {
		return Image{}, ErrUnsupportedImage
	}

	filename := upload.Side + extension
	if err := os.WriteFile(filepath.Join(directory, filename), data, 0o640); err != nil {
		return Image{}, fmt.Errorf("write %s scan image: %w", upload.Side, err)
	}
	digest := sha256.Sum256(data)
	return Image{
		Side:       upload.Side,
		MIMEType:   mimeType,
		ByteSize:   int64(len(data)),
		Width:      configuration.Width,
		Height:     configuration.Height,
		SHA256:     hex.EncodeToString(digest[:]),
		storageKey: filepath.ToSlash(filepath.Join(sessionID, filename)),
	}, nil
}

func newID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf(
		"%x-%x-%x-%x-%x",
		value[0:4], value[4:6], value[6:8], value[8:10], value[10:16],
	), nil
}
