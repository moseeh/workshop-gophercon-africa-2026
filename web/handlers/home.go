package handlers

import (
	"context"
	"log/slog"
	"net/http"
	"time"
	"workshop/internal/domain/sighting"
	"workshop/web/views/pages"
)

type SightingsLister interface {
	List(ctx context.Context, filter sighting.ListFilter) ([]sighting.Sighting, error)
}

// voyageStart drops the lone 1948 record, which would leave decades of empty timeline.
var voyageStart = time.Date(2010, time.January, 1, 0, 0, 0, 0, time.UTC)

func Home(logger *slog.Logger, sightings SightingsLister) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		from := voyageStart
		items, err := sightings.List(ctx, sighting.ListFilter{
			FromDate: &from,
		})
		if err != nil {
			logger.ErrorContext(ctx, "handlers: listing sightings: "+err.Error())
			renderError(ctx, w, logger, http.StatusInternalServerError, "Unable to load sightings.")
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if err = pages.Home(items).Render(ctx, w); err != nil {
			logger.ErrorContext(ctx, "handlers: rendering sightings: "+err.Error())
			renderError(ctx, w, logger, http.StatusInternalServerError, "Unable to render page.")
		}
	}
}
