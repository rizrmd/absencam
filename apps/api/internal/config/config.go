package config

import (
	"os"
	"strings"
)

type Config struct {
	AppName     string
	Version     string
	Env         string
	Addr        string
	DatabaseURL string
	CORSOrigins []string
}

func Load() Config {
	origins := splitCSV(getenv("CORS_ORIGINS", "http://localhost:5173"))
	return Config{
		AppName:     getenv("APP_NAME", "absencam-api"),
		Version:     getenv("APP_VERSION", "0.1.0"),
		Env:         getenv("APP_ENV", "development"),
		Addr:        getenv("API_ADDR", ":8080"),
		DatabaseURL: getenv("DATABASE_URL", "postgres://absencam:absencam@127.0.0.1:5432/absencam?sslmode=disable"),
		CORSOrigins: origins,
	}
}

func getenv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}
