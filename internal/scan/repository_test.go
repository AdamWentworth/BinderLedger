package scan

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"
)

func TestPrepareImageStoresValidatedJPEG(t *testing.T) {
	var source bytes.Buffer
	wantImage := image.NewRGBA(image.Rect(0, 0, 320, 448))
	wantImage.Set(20, 20, color.RGBA{R: 100, G: 80, B: 60, A: 255})
	if err := jpeg.Encode(&source, wantImage, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}

	item, err := prepareImage(t.TempDir(), "scan-id", Upload{
		Side:   "front",
		Reader: bytes.NewReader(source.Bytes()),
	})
	if err != nil {
		t.Fatal(err)
	}
	if item.MIMEType != "image/jpeg" || item.Width != 320 || item.Height != 448 {
		t.Fatalf("unexpected image metadata: %#v", item)
	}
	if item.storageKey != "scan-id/front.jpg" {
		t.Fatalf("storage key = %q", item.storageKey)
	}
	if len(item.SHA256) != 64 {
		t.Fatalf("sha256 length = %d", len(item.SHA256))
	}
}

func TestPrepareImageRejectsInvalidContent(t *testing.T) {
	_, err := prepareImage(t.TempDir(), "scan-id", Upload{
		Side:   "front",
		Reader: strings.NewReader("not a picture"),
	})
	if err != ErrUnsupportedImage {
		t.Fatalf("error = %v, want %v", err, ErrUnsupportedImage)
	}
}

func TestNewIDReturnsUUID(t *testing.T) {
	id, err := newID()
	if err != nil {
		t.Fatal(err)
	}
	if len(id) != 36 || id[14] != '4' || id[8] != '-' || id[13] != '-' || id[18] != '-' || id[23] != '-' {
		t.Fatalf("id = %q, want version 4 UUID", id)
	}
}
