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
