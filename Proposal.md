# Project Proposal — Global Plastic Pollution & Ocean Health Dashboard

## Project Description

This project builds an interactive dashboard that visualizes the global flow of plastic waste — from country-level production and mismanagement, through major polluting rivers, to ocean health degradation. The central question is: **which countries and rivers are the dominant sources of ocean plastic, what structural factors drive mismanagement, and how is ocean health trending as a result?**

The dashboard will guide users through a three-act story: (1) where plastic waste is generated and poorly managed, (2) how it reaches the ocean via river systems, and (3) what impact it has on ocean health across regions.

## Motivation

Over 8 million tonnes of plastic enter the ocean every year, yet the problem remains abstract to most people. A key insight from research — that just 10 rivers account for roughly 90% of ocean plastic input — gives this dashboard a concrete, actionable story to tell. Plastic pollution sits at the intersection of economic development, infrastructure, and environmental policy, making it highly relevant to Southeast Asia, where several of the worst-offending rivers are located (Mekong, Yangtze, Pasig).

Beyond environmental urgency, this topic is accessible and visually compelling: maps, flow diagrams, and decomposed health scores translate naturally into rich interactive charts.

## Dataset Description

| Source | Content | Format |
|---|---|---|
| [Our World in Data — Plastic Pollution](https://ourworldindata.org/plastic-pollution) | Per-capita waste, mismanagement rates, ocean inputs by country/year | Free CSV download |
| [Ocean Health Index](https://oceanhealthindex.org/global-scores/) | Annual ocean health scores across 10 sub-goals by country | Free CSV download |
| [The Ocean Cleanup — River Sources](https://theoceancleanup.com/sources/) | Top 1,000 plastic-emitting rivers with estimated annual input | Published research data |
| [Kaggle — Plastic Pollution](https://www.kaggle.com/datasets/souvikgiri/plastic-pollution) | Country-level waste generation and recycling rates | Free CSV |

All datasets are publicly available and free. Data spans 2000–2023, is country-level or river-level, and includes numeric, geographic, and temporal dimensions. Known limitations include sparse data for low-income nations and estimation uncertainty in river plastic flow models.

## Visualization Challenge

This dataset presents several non-trivial visualization problems:

- **Multi-scale spatial mismatch.** Plastic waste is measured at the country level, but ocean impact follows ocean currents and river catchment boundaries — neither of which aligns with political borders. Encoding this requires combining choropleth maps with flow overlays.
- **Causal chain across three levels.** The story runs from land → river → ocean. Connecting these three spatial scales in a single coherent dashboard without losing the user requires careful layout and linked views.
- **Right-skewed distributions.** A handful of countries and rivers dominate the data. Standard linear scales hide the long tail; log scales confuse general audiences. Interactive filtering is essential.
- **Composite index decomposition.** The Ocean Health Index score is a weighted average of 10 sub-goals. Showing both the overall score and its components — and letting users compare countries — requires part-whole chart design beyond a simple bar chart.
- **Temporal + spatial together.** Showing how mismanagement rates and ocean health evolve over 20+ years, spatially, requires animated or brushable time controls.