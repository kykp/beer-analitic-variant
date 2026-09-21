const beers = [
  { id: 1, name: 'Жигулёвское', style: 'Лагер', abv: 4.0, brewery: 'Балтика' },
  { id: 2, name: 'Guinness Draught', style: 'Стаут', abv: 4.2, brewery: 'Guinness' },
  { id: 3, name: 'Paulaner Weissbier', style: 'Пшеничное', abv: 5.5, brewery: 'Paulaner' },
  { id: 4, name: 'Stella Artois', style: 'Пилснер', abv: 5.0, brewery: 'Stella Artois' },
  { id: 5, name: 'BrewDog Punk IPA', style: 'IPA', abv: 5.6, brewery: 'BrewDog' }
]

const TODAY = new Date('2026-09-21')

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getMonthKey(date) {
  return toISO(date).slice(0, 7)
}

function parseMonthKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  return { year: y, month: m - 1 }
}

export function getMonthDays(monthKey) {
  const { year, month } = parseMonthKey(monthKey)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const days = []
  for (let d = 1; d <= lastDay; d++) {
    days.push(toISO(new Date(year, month, d)))
  }
  return days
}

export function getMonthLabel(monthKey) {
  const { year, month } = parseMonthKey(monthKey)
  return new Date(year, month, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric'
  })
}

export function shiftMonth(monthKey, delta) {
  const { year, month } = parseMonthKey(monthKey)
  return getMonthKey(new Date(year, month + delta, 1))
}

export const todayStr = toISO(TODAY)
export const currentMonthKey = getMonthKey(TODAY)

function generateAllSales(beerId) {
  const rand = seededRandom(beerId * 1000)
  const map = {}
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth() - 6, 1)
  const end = new Date(TODAY.getFullYear(), TODAY.getMonth() + 7, 0)
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getDay()
    const weekendBoost = dow === 5 || dow === 6 ? 1.4 : 1
    const base = 20 + Math.floor(rand() * 80)
    map[toISO(cur)] = Math.round(base * weekendBoost)
    cur.setDate(cur.getDate() + 1)
  }
  return map
}

export const beerData = beers.map((beer) => ({
  ...beer,
  salesByDay: generateAllSales(beer.id)
}))
