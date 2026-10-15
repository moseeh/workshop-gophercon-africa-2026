package species

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSpecies_Group(t *testing.T) {
	t.Parallel()

	tt := map[string]struct {
		input Species
		want  Group
	}{
		"Whale by family": {
			input: Species{Family: "Balaenopteridae", Genus: "Megaptera", VernacularName: "humpback whale"},
			want:  GroupWhales,
		},
		"Beluga is a whale": {
			input: Species{Family: "Monodontidae", Genus: "Delphinapterus", VernacularName: "beluga whale"},
			want:  GroupWhales,
		},
		"Orca is a whale despite its family": {
			input: Species{Family: "Delphinidae", Genus: "Orcinus", VernacularName: "orca"},
			want:  GroupWhales,
		},
		"Other dolphins stay dolphins": {
			input: Species{Family: "Delphinidae", Genus: "Tursiops", VernacularName: "common bottlenose dolphin"},
			want:  GroupDolphins,
		},
		"Whale shark is a shark": {
			input: Species{Family: "Rhincodontidae", Genus: "Rhincodon", VernacularName: "Whale Shark"},
			want:  GroupSharks,
		},
		"Wildebeest split from other bovids": {
			input: Species{Family: "Bovidae", Genus: "Connochaetes", VernacularName: "blue wildebeest"},
			want:  GroupWildebeest,
		},
		"Impala is an antelope": {
			input: Species{Family: "Bovidae", Genus: "Aepyceros", VernacularName: "impala"},
			want:  GroupAntelope,
		},
		"Ungrouped species is its own group": {
			input: Species{Family: "Unknownidae", VernacularName: "aardvark"},
			want:  Group("Aardvark"),
		},
		"Falls back to the canonical name": {
			input: Species{CanonicalName: "Orycteropus afer"},
			want:  Group("Orycteropus afer"),
		},
		"Nothing at all": {
			input: Species{},
			want:  Group("Unknown animals"),
		},
	}

	for name, test := range tt {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, test.want, test.input.Group())
		})
	}
}
