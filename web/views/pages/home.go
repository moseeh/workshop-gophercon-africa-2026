package pages

import (
	"strconv"
	"time"

	"workshop/internal/domain/sighting"
	"workshop/web/views/components"
)

// storms counts the sightings made under a thunderstorm.
func storms(sightings []sighting.Sighting) int {
	n := 0
	for _, s := range sightings {
		if components.Sky(s) == "storm" {
			n++
		}
	}
	return n
}

// withNotes counts the sightings the observer wrote remarks for.
func withNotes(sightings []sighting.Sighting) int {
	n := 0
	for _, s := range sightings {
		if s.Remarks != "" {
			n++
		}
	}
	return n
}

// groupTallies counts sightings per animal group, most seen first.
func groupTallies(sightings []sighting.Sighting) []sighting.Tally {
	counts := sighting.CountBy(sightings, func(s sighting.Sighting) string {
		return s.Species.Group().String()
	})
	return sighting.Top(counts, len(counts))
}

// year writes a year, or nothing for a zero time.
func year(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return strconv.Itoa(t.Year())
}

// yearSpan is the date readout before the voyage starts, such as "2016 – 2026".
func yearSpan(sum sighting.Summary) string {
	if sum.Earliest.IsZero() {
		return "No voyage yet"
	}
	return year(sum.Earliest) + " – " + year(sum.Latest)
}
