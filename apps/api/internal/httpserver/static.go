package httpserver

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func spaHandler(dist string) http.Handler {
	root := filepath.Clean(dist)
	fileServer := http.FileServer(http.Dir(root))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		rel := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if rel == "." || rel == "" {
			rel = "index.html"
		}

		full := filepath.Join(root, filepath.FromSlash(rel))
		if !strings.HasPrefix(full, root+string(os.PathSeparator)) && full != root {
			http.NotFound(w, r)
			return
		}

		info, err := os.Stat(full)
		if err != nil || info.IsDir() {
			http.ServeFile(w, r, filepath.Join(root, "index.html"))
			return
		}

		fileServer.ServeHTTP(w, r)
	})
}
