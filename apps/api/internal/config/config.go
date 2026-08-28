package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppName            string
	Version            string
	Env                string
	Addr               string
	DatabaseURL        string
	WebDist            string
	CORSOrigins        []string
	FaceMatchThreshold float64
}

func Load() Config {
	origins := splitCSV(getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:3000"))
	return Config{
		AppName:            getenv("APP_NAME", "absencam-api"),
		Version:            getenv("APP_VERSION", "0.1.0"),
		Env:                getenv("APP_ENV", "development"),
		Addr:               getenv("API_ADDR", ":8080"),
		DatabaseURL:        getenv("DATABASE_URL", "postgres://absencam:absencam@127.0.0.1:5432/absencam?sslmode=disable"),
		WebDist:            getenv("WEB_DIST", ""),
		CORSOrigins:        origins,
		FaceMatchThreshold: getenvFloat("FACE_MATCH_THRESHOLD", 0.40),
	}
}

func getenvFloat(key string, fallback float64) float64 {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return fallback
	}
	return v
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
