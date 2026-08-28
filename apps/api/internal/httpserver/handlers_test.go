package httpserver

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/rizrmd/absencam/apps/api/internal/config"
)

func TestHealth(t *testing.T) {
	t.Parallel()

	srv := New(config.Config{
		AppName:     "absencam-api",
		Version:     "0.1.0",
		Env:         "test",
		Addr:        ":0",
		CORSOrigins: []string{"http://localhost:5173"},
	}, nil, slog.New(slog.NewTextHandler(os.Stdout, nil)))

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	srv.http.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var body healthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Status != "ok" || body.App != "absencam-api" {
		t.Fatalf("unexpected body: %+v", body)
	}
}

func TestReadyWithoutDB(t *testing.T) {
	t.Parallel()

	srv := New(config.Config{
		AppName:     "absencam-api",
		Env:         "test",
		Addr:        ":0",
		CORSOrigins: []string{"*"},
	}, nil, slog.New(slog.NewTextHandler(os.Stdout, nil)))

	req := httptest.NewRequest(http.MethodGet, "/api/ready", nil)
	rec := httptest.NewRecorder()
	srv.http.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestEnrollWithoutDB(t *testing.T) {
	t.Parallel()

	srv := New(config.Config{
		AppName:     "absencam-api",
		Env:         "test",
		Addr:        ":0",
		CORSOrigins: []string{"*"},
	}, nil, slog.New(slog.NewTextHandler(os.Stdout, nil)))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/faces/enroll", strings.NewReader(`{"code":"e1","full_name":"Ada"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.http.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestScanRejectsBadJSON(t *testing.T) {
	t.Parallel()

	srv := New(config.Config{
		AppName:            "absencam-api",
		Env:                "test",
		Addr:               ":0",
		CORSOrigins:        []string{"*"},
		FaceMatchThreshold: 0.4,
	}, nil, slog.New(slog.NewTextHandler(os.Stdout, nil)))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/faces/scan", strings.NewReader(`{`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.http.Handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 without db", rec.Code)
	}
}

func TestSPAServesIndexAndAssets(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>absencam</html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "app.js"), []byte("console.log('ok')"), 0o644); err != nil {
		t.Fatal(err)
	}

	srv := New(config.Config{
		AppName:     "absencam-api",
		Env:         "test",
		Addr:        ":0",
		WebDist:     dir,
		CORSOrigins: []string{"*"},
	}, nil, slog.New(slog.NewTextHandler(os.Stdout, nil)))

	indexReq := httptest.NewRequest(http.MethodGet, "/", nil)
	indexRec := httptest.NewRecorder()
	srv.http.Handler.ServeHTTP(indexRec, indexReq)
	if indexRec.Code != http.StatusOK || !strings.Contains(indexRec.Body.String(), "absencam") {
		t.Fatalf("index status=%d body=%q", indexRec.Code, indexRec.Body.String())
	}

	assetReq := httptest.NewRequest(http.MethodGet, "/app.js", nil)
	assetRec := httptest.NewRecorder()
	srv.http.Handler.ServeHTTP(assetRec, assetReq)
	if assetRec.Code != http.StatusOK || !strings.Contains(assetRec.Body.String(), "console.log") {
		t.Fatalf("asset status=%d body=%q", assetRec.Code, assetRec.Body.String())
	}

	spaReq := httptest.NewRequest(http.MethodGet, "/scan", nil)
	spaRec := httptest.NewRecorder()
	srv.http.Handler.ServeHTTP(spaRec, spaReq)
	if spaRec.Code != http.StatusOK || !strings.Contains(spaRec.Body.String(), "absencam") {
		t.Fatalf("spa fallback status=%d body=%q", spaRec.Code, spaRec.Body.String())
	}
}

func TestInfo(t *testing.T) {
	t.Parallel()

	srv := New(config.Config{
		AppName:     "absencam-api",
		Version:     "0.1.0",
		Env:         "test",
		Addr:        ":0",
		CORSOrigins: []string{"http://localhost:5173"},
	}, nil, slog.New(slog.NewTextHandler(os.Stdout, nil)))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/info", nil)
	rec := httptest.NewRecorder()
	srv.http.Handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}
