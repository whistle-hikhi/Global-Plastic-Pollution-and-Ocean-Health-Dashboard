const BASE = '/api'

export async function fetchPlastic() {
  const res = await fetch(`${BASE}/plastic`)
  return res.json()
}

export async function fetchTopPlastic(n = 20) {
  const res = await fetch(`${BASE}/plastic/top?n=${n}`)
  return res.json()
}

export async function fetchRivers(top = 200) {
  const res = await fetch(`${BASE}/rivers?top=${top}`)
  return res.json()
}

export async function fetchRiversByCountry(top = 20) {
  const res = await fetch(`${BASE}/rivers/by-country?top=${top}`)
  return res.json()
}

export async function fetchRiversByContinent() {
  const res = await fetch(`${BASE}/rivers/by-continent`)
  return res.json()
}

export async function fetchOHI(goal = 'Index', dimension = 'score', year = 2023) {
  const res = await fetch(`${BASE}/ohi?goal=${goal}&dimension=${dimension}&year=${year}`)
  return res.json()
}

export async function fetchOHIGoals() {
  const res = await fetch(`${BASE}/ohi/goals`)
  return res.json()
}

export async function fetchOHITrend(regionId = 0, goal = 'Index', dimension = 'score') {
  const res = await fetch(`${BASE}/ohi/trend?region_id=${regionId}&goal=${goal}&dimension=${dimension}`)
  return res.json()
}

export async function fetchOHIRadar(regionId = 0, year = 2023) {
  const res = await fetch(`${BASE}/ohi/radar?region_id=${regionId}&year=${year}`)
  return res.json()
}

export async function fetchForecast(regionId = 0, model = 'linear', horizon = 5) {
  const res = await fetch(`${BASE}/ohi/forecast?region_id=${regionId}&model=${model}&horizon=${horizon}`)
  return res.json()
}
