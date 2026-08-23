package migrations

import "embed"

// Files contains the ordered SQL migration set.
//
//go:embed *.sql
var Files embed.FS
