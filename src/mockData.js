export const chains = [
  { id: 'lenta', name: 'Лента', color: '#FEBE10', hasWordmark: true },
  { id: 'pyaterochka', name: 'Пятёрочка', color: '#EB2316', hasWordmark: true },
  { id: 'perekrestok', name: 'Перекрёсток', color: '#00723A', hasWordmark: true }
]

export const defaultChainId = chains[0].id

const beers = [
  { id: 1, brand: 'Жигули Барное', name: 'Пиво Жигули Барное 0,45 бан' },
  { id: 2, brand: 'Жигули Барное', name: 'Пиво Жигули Барное 0,45 бут' },
  { id: 3, brand: 'Жигули Барное', name: 'Пиво Жигули Барное 0,31 бут' },
  { id: 4, brand: 'Жигули Барное', name: 'Пиво Жигули Барное 0,45 бан ОПХ Екат' },
  { id: 5, brand: 'Жигули Барное', name: 'Пиво Жигули Барное 0,45 бут ОПХ Екат' },
  { id: 6, brand: 'Жигули Барное', name: 'Пиво Жигули Барное 0,9 бут' },
  { id: 7, brand: 'Жигули 1968', name: 'Пиво Жигули 1968 0,43 бан' },
  { id: 8, brand: 'Жигули 1968', name: 'Пиво Жигули 1968 0,9 pet' },
  { id: 9, brand: 'Жигули 1968', name: 'Пиво Жигули 1968 0,43 бан ОПХ Екат' },
  { id: 10, brand: 'Жигули 1968', name: 'Пиво Жигули 1968 0,43 бут' },
  { id: 11, brand: 'Жигули 1968', name: 'Пиво Жигули 1968 0,43 бут ОПХ Екат' },
  { id: 12, brand: 'Хамовники', name: 'Пиво Хамовники Венское 0,45 бан' },
  { id: 13, brand: 'Хамовники', name: 'Пиво Хамовники Пильзенское 0,45 бан' },
  { id: 14, brand: 'Хамовники', name: 'Пиво Хамовники Венское 0,45 бут' },
  { id: 15, brand: 'Хамовники', name: 'Пиво Хамовники Пильзенское 0,45 бут' },
  { id: 16, brand: 'Хамовники', name: 'Пиво Хамовники Мюнхенское 0,45 бан' },
  { id: 17, brand: 'Хамовники', name: 'Пиво Хамовники Пшеничное 0,45 бут' },
  { id: 18, brand: 'Хамовники', name: 'Пиво Хамовники Московское 0,45 бут' },
  { id: 19, brand: 'Жигули Экспорт', name: 'Пиво Жигули Барное Экспорт 1,25 pet' },
  { id: 20, brand: 'Жигули Экспорт', name: 'Пиво Жигули Барное Экспорт 0,45 бан' },
  { id: 21, brand: 'Жигули Экспорт', name: 'Пиво Жигули Барное Экспорт 0,45 бут' },
  { id: 22, brand: 'Жигули Экспорт', name: 'Пиво Жигули Барное Экспорт 0,45 бан ОПХ Екат' },
  { id: 23, brand: 'Жигули Экспорт', name: 'Пиво Жигули Барное Экспорт 1,25 pet ОПХ Екат' },
  { id: 24, brand: 'Жигули Экспорт', name: 'Пиво Жигули Барное Экспорт 0,45 бут ОПХ Екат' },
  { id: 25, brand: 'Hollandia Licensed', name: 'Пиво Hollandia лиц 0,45 бан' },
  { id: 26, brand: 'Hollandia Licensed', name: 'Пиво Hollandia лиц 0,45 бут' },
  { id: 27, brand: 'Hollandia Licensed', name: 'Пиво Hollandia лиц 1,25 pet' },
  { id: 28, brand: 'Hollandia Licensed', name: 'Пиво Hollandia б/а 0,45 бан' },
  { id: 29, brand: 'Волковская Пивоварня Пиво', name: 'Пиво ВП IPA/ИПА НФ 0,45 бут' },
  { id: 30, brand: 'Волковская Пивоварня Пиво', name: 'Медовуха ВП Неправильный мёд 0,45 бут' },
  { id: 31, brand: 'Волковская Пивоварня Пиво', name: 'Медовуха ВП Неправильный Мёд 0,43 бан' },
  { id: 32, brand: 'Волковская Пивоварня Пиво', name: 'Пиво ВП Пилс 0,45 бут' },
  { id: 33, brand: 'Волковская Пивоварня Пиво', name: 'Пиво ВП APA/AПА 0,45 бут' },
  { id: 34, brand: 'Волковская Пивоварня Пиво', name: 'Пиво ВП Вишневый Эль 0,45 бут' },
  { id: 35, brand: 'Волковская Пивоварня Пиво', name: 'Пиво ВП Шок.Стаут 0,45 бут' },
  { id: 36, brand: 'Волковская Пивоварня Пиво', name: 'Пиво ВП Фермерский Эль 0,45 бут' },
  { id: 37, brand: 'Волковская Пивоварня Пиво', name: 'Пиво ВП Session IPA 0,45 бут' },
  { id: 38, brand: 'Волковская Пивоварня Пиво', name: 'Пиво ВП Эль Мохнатый Шмель 0,45 бут' },
  { id: 39, brand: 'Кружечка Чешского', name: 'Пиво Кружечка Чешского 1,25 pet' },
  { id: 40, brand: 'Кружечка Чешского', name: 'Пиво Кружечка Чешского 0,43 бан' },
  { id: 41, brand: 'Кружечка Чешского', name: 'Пиво Кружечка Чешского 1,15 pet' },
  { id: 42, brand: 'Кружечка Чешского', name: 'Пиво Кружечка Чешского 1,25 pet ОПХ Екат' }
]

const TODAY = new Date()

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

// В approved-режиме план "заморожен" на ближайшие EDITABLE_LEAD_DAYS дней (сегодня и
// следующие 2) — на них уже нельзя оперативно влиять (отгрузки/логистика). Редактируется
// всё, что начинается с (today + EDITABLE_LEAD_DAYS) до конца месяца.
export const EDITABLE_LEAD_DAYS = 3

export function getEditableDays(monthKey = currentMonthKey, lead = EDITABLE_LEAD_DAYS) {
  const monthDays = getMonthDays(monthKey)
  const [y, m, d] = todayStr.split('-').map(Number)
  const cutoff = toISO(new Date(y, m - 1, d + lead))
  return monthDays.filter((day) => day >= cutoff)
}

export function getEditableCutoffDate(lead = EDITABLE_LEAD_DAYS) {
  const [y, m, d] = todayStr.split('-').map(Number)
  return toISO(new Date(y, m - 1, d + lead))
}

// Факт продаж приходит с опозданием ACTUAL_LAG_DAYS дней.
// Т.е. на сегодня 23-е мы имеем достоверный факт только по 20-е включительно;
// дни 21, 22, 23 — «ждём факт», их дельту с планом ещё нельзя считать.
export const ACTUAL_LAG_DAYS = 3

export function getActualCutoffDate(lag = ACTUAL_LAG_DAYS) {
  const [y, m, d] = todayStr.split('-').map(Number)
  return toISO(new Date(y, m - 1, d - lag))
}

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

// Мок факта: близко к плану, но с шумом. У некоторых SKU/дней сдвиг сильнее — чтобы
// на variance-таблице были видны и «в норме», и провалы, и переотгрузки.
// Данные есть только по дни ≤ getActualCutoffDate() (лаг 3 дня).
function generateActuals(beerId, salesByDay) {
  const rand = seededRandom(beerId * 777 + 13)
  const map = {}
  const cutoff = getActualCutoffDate()
  const skuBias = 0.9 + rand() * 0.2 // 90%–110% — «характер» этого SKU
  for (const [day, plan] of Object.entries(salesByDay)) {
    if (day > cutoff) continue
    const dayNoise = 0.82 + rand() * 0.32 // 82%–114%
    const shockChance = rand()
    const shock = shockChance < 0.05 ? 0.4 : shockChance > 0.97 ? 1.6 : 1
    map[day] = Math.max(0, Math.round(plan * skuBias * dayNoise * shock))
  }
  return map
}

function assignChains(beerId) {
  const rand = seededRandom(beerId * 31 + 7)
  const assigned = chains.filter(() => rand() > 0.35).map((c) => c.id)
  if (assigned.length === 0) {
    const idx = Math.floor(rand() * chains.length)
    assigned.push(chains[idx].id)
  }
  return assigned
}

export const beerData = beers.map((beer) => {
  const salesByDay = generateAllSales(beer.id)
  return {
    ...beer,
    chainIds: assignChains(beer.id),
    salesByDay,
    actualByDay: generateActuals(beer.id, salesByDay)
  }
})

export function getBeersForChain(chainId) {
  return beerData.filter((b) => b.chainIds.includes(chainId))
}
