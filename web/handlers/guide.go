package handlers

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"uuid"
	"workshop/internal/domain/sighting"
	"workshop/web/views/components"
)

type SightingFinder interface {
	Find(ctx context.Context, id uuid.UUID) (sighting.Sighting, error)
}

// Guide renders one sighting's field-guide page, fetched by the globe when a pin is opened.
func Guide(logger *slog.Logger, sightings SightingFinder) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			http.NotFound(w, r)
			return
		}

		s, err := sightings.Find(ctx, id)
		if errors.Is(err, sighting.ErrNotFound) {
			http.NotFound(w, r)
			return
		} else if err != nil {
			logger.ErrorContext(ctx, "handlers: finding sighting: "+err.Error())
			http.Error(w, "Unable to load sighting.", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "private, max-age=300")
		if err = components.FieldGuide(s).Render(ctx, w); err != nil {
			logger.ErrorContext(ctx, "handlers: rendering field guide: "+err.Error())
		}
	}
}
