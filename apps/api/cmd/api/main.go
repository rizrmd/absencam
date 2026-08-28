package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rizrmd/absencam/apps/api/internal/config"
	"github.com/rizrmd/absencam/apps/api/internal/db"
	"github.com/rizrmd/absencam/apps/api/internal/httpserver"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Error("database open failed; API will start without a live pool", "err", err)
	} else {
		defer pool.Close()
		migrateCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		if err := db.Migrate(migrateCtx, pool); err != nil {
			log.Error("database migrate failed", "err", err)
		}
		cancel()
	}

	srv := httpserver.New(cfg, pool, log)
	if err := srv.Run(ctx); err != nil {
		log.Error("server exited", "err", err)
		os.Exit(1)
	}
}
