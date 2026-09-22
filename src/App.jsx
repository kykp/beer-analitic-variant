import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  beerData as initialBeerData,
  currentMonthKey,
  getMonthDays,
  getMonthLabel,
  todayStr
} from './mockData.js'

function formatNumber(n) {
  return n.toLocaleString('ru-RU')
}

function dayInfo(dateStr) {
  const d = new Date(dateStr)
  const dow = d.toLocaleDateString('ru-RU', { weekday: 'short' })
  return {
    num: d.getDate(),
    dow,
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
    isPast: dateStr < todayStr,
    isToday: dateStr === todayStr
  }
}

const STORAGE_PREFIX = 'mosbrew_beer_plan_v1_'

function loadBeerPlan(beerId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + beerId)
    if (!raw) return null
    const data = JSON.parse(raw)
    return {
      shipmentDays: new Set(data.shipmentDays || []),
      overrides: data.overrides || {},
      totalUnits: typeof data.totalUnits === 'number' ? data.totalUnits : 5000,
      pinned: new Set(data.pinned || [])
    }
  } catch {
    return null
  }
}

function saveBeerPlan(beerId, state) {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + beerId,
      JSON.stringify({
        shipmentDays: Array.from(state.shipmentDays),
        overrides: state.overrides,
        totalUnits: state.totalUnits,
        pinned: Array.from(state.pinned || [])
      })
    )
  } catch {}
}

// Разносит total по dayList с учётом закреплённых дней и весов.
// pinned теряет ноль внимания к весам: их значения фиксированы,
// остаток (total - sum(pinned)) делится между незакреплёнными пропорционально весам.
// Целочисленные остатки раздаются по методу наибольших дробных частей.
function distributeTotalByWeights({ total, dayList, pinnedDays, pinnedValues, weights }) {
  const result = {}
  let pinnedSum = 0
  for (const day of dayList) {
    if (pinnedDays.has(day)) {
      const v = Math.max(0, Math.round(pinnedValues[day] || 0))
      result[day] = v
      pinnedSum += v
    }
  }

  const remainder = Math.max(0, total - pinnedSum)
  const unpinned = dayList.filter((d) => !pinnedDays.has(d))
  if (unpinned.length === 0) return result

  const weightOf = (d) => Math.max(0, weights?.[d] ?? 1)
  const weightSum = unpinned.reduce((s, d) => s + weightOf(d), 0)

  if (weightSum <= 0) {
    for (const day of unpinned) result[day] = 0
    return result
  }

  const parts = unpinned.map((day) => {
    const exact = remainder * (weightOf(day) / weightSum)
    const floor = Math.floor(exact)
    return { day, floor, frac: exact - floor }
  })
  let leftover = remainder - parts.reduce((s, p) => s + p.floor, 0)
  parts.sort((a, b) => b.frac - a.frac)
  for (let i = 0; i < parts.length && leftover > 0; i++) {
    parts[i].floor += 1
    leftover -= 1
  }
  for (const p of parts) result[p.day] = p.floor
  return result
}

const DISTRIBUTION_PRESETS = [
  {
    id: 'even',
    label: 'Равномерно',
    hint: 'Одинаково по всем дням месяца',
    weightsFor: () => ({})
  },
  {
    id: 'workdays',
    label: 'Только будни',
    hint: 'Пн–Пт получают план, выходные — 0',
    weightsFor: (days) => {
      const w = {}
      for (const day of days) {
        const dow = new Date(day).getDay()
        w[day] = dow === 0 || dow === 6 ? 0 : 1
      }
      return w
    }
  },
  {
    id: 'weekends',
    label: 'Только выходные',
    hint: 'Сб и Вс получают план, будни — 0',
    weightsFor: (days) => {
      const w = {}
      for (const day of days) {
        const dow = new Date(day).getDay()
        w[day] = dow === 0 || dow === 6 ? 1 : 0
      }
      return w
    }
  }
]

function applyPlansToBeers(beers) {
  const monthDays = getMonthDays(currentMonthKey)
  return beers.map((beer) => {
    const plan = loadBeerPlan(beer.id)
    if (!plan) return beer
    const salesByDay = { ...beer.salesByDay }
    for (const day of monthDays) {
      salesByDay[day] = plan.shipmentDays.has(day) ? plan.overrides[day] || 0 : 0
    }
    return { ...beer, salesByDay }
  })
}

export default function App() {
  const [beers, setBeers] = useState(() => applyPlansToBeers(initialBeerData))
  const [selectedId, setSelectedId] = useState(null)
  const [collapsedBrands, setCollapsedBrands] = useState(() => {
    const brands = new Set()
    initialBeerData.forEach((b) => brands.add(b.brand))
    return brands
  })

  const monthDays = useMemo(() => getMonthDays(currentMonthKey), [])
  const monthLabel = useMemo(() => getMonthLabel(currentMonthKey), [])

  const beerRows = useMemo(
    () =>
      beers.map((b) => {
        const total = monthDays.reduce((s, d) => s + b.salesByDay[d], 0)
        return { ...b, monthTotal: total }
      }),
    [beers, monthDays]
  )

  const brandGroups = useMemo(() => {
    const order = []
    const map = new Map()
    for (const beer of beerRows) {
      if (!map.has(beer.brand)) {
        map.set(beer.brand, [])
        order.push(beer.brand)
      }
      map.get(beer.brand).push(beer)
    }
    return order.map((brand) => {
      const skus = map.get(brand)
      const byDay = {}
      for (const day of monthDays) {
        byDay[day] = skus.reduce((s, b) => s + b.salesByDay[day], 0)
      }
      const monthTotal = skus.reduce((s, b) => s + b.monthTotal, 0)
      return { brand, skus, byDay, monthTotal }
    })
  }, [beerRows, monthDays])

  const totals = useMemo(() => {
    const byDay = {}
    for (const day of monthDays) {
      byDay[day] = beerRows.reduce((s, b) => s + b.salesByDay[day], 0)
    }
    const grand = Object.values(byDay).reduce((s, v) => s + v, 0)
    return { byDay, grand }
  }, [beerRows, monthDays])

  function toggleBrand(brand) {
    setCollapsedBrands((prev) => {
      const next = new Set(prev)
      if (next.has(brand)) next.delete(brand)
      else next.add(brand)
      return next
    })
  }

  const allCollapsed = collapsedBrands.size === brandGroups.length
  function toggleAll() {
    if (allCollapsed) setCollapsedBrands(new Set())
    else setCollapsedBrands(new Set(brandGroups.map((g) => g.brand)))
  }

  const selected = selectedId ? beers.find((b) => b.id === selectedId) : null

  function updateBeerSales(beerId, nextSalesByDay) {
    setBeers((prev) => prev.map((b) => (b.id === beerId ? { ...b, salesByDay: nextSalesByDay } : b)))
  }

  const scrollRef = useRef(null)
  useLayoutEffect(() => {
    if (selected) return
    const container = scrollRef.current
    if (!container) return
    const todayCol = container.querySelector('thead .day-col.today')
    if (!todayCol) return
    const containerRect = container.getBoundingClientRect()
    const colRect = todayCol.getBoundingClientRect()
    const stickyOffset = 320
    const desired =
      colRect.left - containerRect.left + container.scrollLeft
      - (containerRect.width - stickyOffset) / 2 + colRect.width / 2 - stickyOffset
    container.scrollLeft = Math.max(0, desired + stickyOffset)
  }, [])

  if (selected) {
    return (
      <BeerDetails
        key={selected.id}
        beer={selected}
        onBack={() => setSelectedId(null)}
        onChange={(next) => updateBeerSales(selected.id, next)}
      />
    )
  }

  return (
    <>
      <TopBar />
      <div className="page">
        <div className="toolbar">
          <div>
            <h1>План продаж</h1>
            <p className="subtitle">
              {monthLabel} · план на месяц <strong>{formatNumber(totals.grand)}</strong> шт.
            </p>
          </div>
          <div className="toolbar-actions">
            <button className="btn-ghost" onClick={toggleAll}>
              {allCollapsed ? 'Развернуть все' : 'Свернуть все'}
            </button>
            <div className="search-mini">
              <span className="search-icon">⌕</span>
              <input placeholder="Поиск по позициям" />
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <div className="table-scroll" ref={scrollRef}>
            <table className="beer-table days-table">
              <thead>
                <tr>
                  <th className="sticky-col name-col">Наименование</th>
                  {monthDays.map((day) => {
                    const h = dayInfo(day)
                    return (
                      <th
                        key={day}
                        className={`num day-col ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''}`}
                      >
                        <div className="day-num">{h.num}</div>
                        <div className="day-dow">{h.dow}</div>
                      </th>
                    )
                  })}
                  <th className="num total-col">Итого</th>
                </tr>
              </thead>
              <tbody>
                {brandGroups.map((group) => {
                  const isCollapsed = collapsedBrands.has(group.brand)
                  return (
                    <Fragment key={group.brand}>
                      <tr
                        className={`brand-header ${isCollapsed ? 'is-collapsed' : ''}`}
                        onClick={() => toggleBrand(group.brand)}
                      >
                        <td className="sticky-col name-col">
                          <div className="brand-name-cell">
                            <span className="chevron">{isCollapsed ? '›' : '⌄'}</span>
                            <div className="brand-name-stack">
                              <span className="brand-title">{group.brand}</span>
                              <span className="brand-meta">{group.skus.length} SKU</span>
                            </div>
                          </div>
                        </td>
                        {monthDays.map((day) => {
                          const h = dayInfo(day)
                          return (
                            <td
                              key={day}
                              className={`num day-col brand-day ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''}`}
                            >
                              {group.byDay[day]}
                            </td>
                          )
                        })}
                        <td className="num total-col brand-day">
                          {formatNumber(group.monthTotal)}
                        </td>
                      </tr>
                      {!isCollapsed &&
                        group.skus.map((beer) => (
                          <tr
                            key={beer.id}
                            className="row-clickable sku-row"
                            onClick={() => setSelectedId(beer.id)}
                          >
                            <td className="sticky-col name-col beer-name">{beer.name}</td>
                            {monthDays.map((day) => {
                              const h = dayInfo(day)
                              return (
                                <td
                                  key={day}
                                  className={`num day-col ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''}`}
                                >
                                  {beer.salesByDay[day]}
                                </td>
                              )
                            })}
                            <td className="num total-col strong">{formatNumber(beer.monthTotal)}</td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                })}
                <tr className="total-row">
                  <td className="sticky-col name-col strong">Итого за день</td>
                  {monthDays.map((day) => {
                    const h = dayInfo(day)
                    return (
                      <td
                        key={day}
                        className={`num day-col strong ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''}`}
                      >
                        {totals.byDay[day]}
                      </td>
                    )
                  })}
                  <td className="num total-col strong">{formatNumber(totals.grand)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="hint">
          Кликни по группе — свернуть/развернуть. Клик по позиции — открыть план по дням.
        </p>
      </div>
    </>
  )
}

function TopBar() {
  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="topbar-brand">
          <span className="topbar-name">#mosbrew</span>
        </div>
        <div className="topbar-search">
          <span className="kbd">⌘ K</span>
          <span>для поиска</span>
        </div>
        <div className="topbar-user">
          <span className="topbar-user-name">Иван П.</span>
          <span className="topbar-user-caret">⌄</span>
        </div>
      </div>
    </div>
  )
}

const WEEK_DOW_LABELS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

function buildCalendarWeeks(days) {
  if (days.length === 0) return []
  const first = new Date(days[0])
  const dow = (first.getDay() + 6) % 7
  const cells = Array(dow).fill(null).concat(days)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function BeerDetails({ beer, onBack, onChange }) {
  const [overrides, setOverrides] = useState(() => loadBeerPlan(beer.id)?.overrides || {})
  const [totalUnits, setTotalUnits] = useState(() => loadBeerPlan(beer.id)?.totalUnits ?? 5000)
  const [pinned, setPinned] = useState(() => loadBeerPlan(beer.id)?.pinned || new Set())
  const [selection, setSelection] = useState(() => new Set())
  const [contextMenu, setContextMenu] = useState(null)
  const [inputPrompt, setInputPrompt] = useState(null)

  const monthDays = useMemo(() => getMonthDays(currentMonthKey), [])

  useEffect(() => {
    saveBeerPlan(beer.id, { shipmentDays: [], overrides, totalUnits, pinned })
  }, [beer.id, overrides, totalUnits, pinned])

  const distributedTotal = useMemo(
    () => Object.values(overrides).reduce((s, v) => s + v, 0),
    [overrides]
  )

  const percents = useMemo(() => {
    const map = {}
    if (totalUnits > 0) {
      for (const [d, v] of Object.entries(overrides)) {
        map[d] = (v / totalUnits) * 100
      }
    }
    return map
  }, [overrides, totalUnits])

  useEffect(() => {
    const next = { ...beer.salesByDay }
    let changed = false
    for (const day of monthDays) {
      const v = overrides[day] || 0
      if ((next[day] || 0) !== v) {
        next[day] = v
        changed = true
      }
    }
    if (changed) onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides, monthDays])

  const presetDaySets = useMemo(() => {
    const filter = (pred) => monthDays.filter((d) => pred(new Date(d)))
    return {
      workdays: filter((d) => d.getDay() >= 1 && d.getDay() <= 5),
      weekends: filter((d) => d.getDay() === 0 || d.getDay() === 6),
      even: filter((d) => d.getDate() % 2 === 0),
      odd: filter((d) => d.getDate() % 2 === 1),
      all: monthDays
    }
  }, [monthDays])

  function togglePinned(daysArr) {
    if (daysArr.length === 0) return
    const allPinned = daysArr.every((d) => pinned.has(d))
    setPinned((prev) => {
      const next = new Set(prev)
      if (allPinned) daysArr.forEach((d) => next.delete(d))
      else daysArr.forEach((d) => next.add(d))
      return next
    })
  }

  function clearAllPinned() {
    setPinned(new Set())
  }

  function applyPreset(presetId) {
    const preset = DISTRIBUTION_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const weights = preset.weightsFor(monthDays)
    const next = distributeTotalByWeights({
      total: totalUnits,
      dayList: monthDays,
      pinnedDays: pinned,
      pinnedValues: overrides,
      weights
    })
    setOverrides(next)
    setSelection(new Set())
  }

  // Меняет total и пересчитывает незакреплённые дни пропорционально их текущим значениям.
  // Если ни один незакреплённый день не имеет значения — просто фиксируем новый total,
  // не заполняя дни нулями (пользователь сам выберет пресет).
  function handleTotalChange(newTotal) {
    const clean = Math.max(0, Math.round(newTotal))
    setTotalUnits(clean)

    const unpinnedSum = monthDays.reduce(
      (s, d) => (pinned.has(d) ? s : s + (overrides[d] || 0)),
      0
    )
    if (unpinnedSum === 0) return

    const weights = {}
    for (const day of monthDays) {
      if (!pinned.has(day)) weights[day] = overrides[day] || 0
    }
    const next = distributeTotalByWeights({
      total: clean,
      dayList: monthDays,
      pinnedDays: pinned,
      pinnedValues: overrides,
      weights
    })
    setOverrides(next)
  }

  function setDayOverride(day, units) {
    setOverrides((prev) => ({ ...prev, [day]: Math.max(0, Math.round(units)) }))
  }

  // Rolling forecast: правит день X и раскидывает delta (prev − new) пропорционально
  // по всем незакреплённым дням > X. Total сохраняется. Дни ≤ X не трогаются.
  // Если будущих дней нет / все закреплены / все нулевые — просто применяем новое значение,
  // total перестанет сходиться и это будет видно в саммари.
  function editDayRolling(day, units) {
    const clean = Math.max(0, Math.round(units))
    const prev = overrides[day] || 0
    const delta = prev - clean

    const future = monthDays.filter((d) => d > day && !pinned.has(d))

    if (delta === 0 || future.length === 0) {
      setOverrides((prevMap) => ({ ...prevMap, [day]: clean }))
      return
    }

    const futureSum = future.reduce((s, d) => s + (overrides[d] || 0), 0)
    const target = Math.max(0, futureSum + delta)

    const weightOf =
      futureSum > 0 ? (d) => Math.max(0, overrides[d] || 0) : () => 1
    const weightSum = future.reduce((s, d) => s + weightOf(d), 0)

    const next = { ...overrides, [day]: clean }
    if (weightSum <= 0) {
      setOverrides(next)
      return
    }

    const parts = future.map((d) => {
      const exact = target * (weightOf(d) / weightSum)
      const floor = Math.floor(exact)
      return { d, floor, frac: exact - floor }
    })
    let leftover = target - parts.reduce((s, p) => s + p.floor, 0)
    parts.sort((a, b) => b.frac - a.frac)
    for (let i = 0; i < parts.length && leftover > 0; i++) {
      parts[i].floor += 1
      leftover -= 1
    }
    for (const p of parts) next[p.d] = p.floor
    setOverrides(next)
  }

  function clearDayOverride(day) {
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[day]
      return next
    })
  }

  function setSameUnitsForDays(daysArr, units) {
    const clean = Math.max(0, Math.round(units))
    setOverrides((prev) => {
      const next = { ...prev }
      daysArr.forEach((d) => {
        next[d] = clean
      })
      return next
    })
    const otherSum = Object.entries(overrides)
      .filter(([d]) => !daysArr.includes(d))
      .reduce((s, [, v]) => s + v, 0)
    setTotalUnits(otherSum + clean * daysArr.length)
    setSelection(new Set())
  }

  function distributeAmongDays(daysArr, total) {
    if (daysArr.length === 0) return
    const per = Math.floor(total / daysArr.length)
    const remainder = total - per * daysArr.length
    setOverrides((prev) => {
      const next = { ...prev }
      daysArr.forEach((d, i) => {
        next[d] = per + (i === daysArr.length - 1 ? remainder : 0)
      })
      return next
    })
    const otherSum = Object.entries(overrides)
      .filter(([d]) => !daysArr.includes(d))
      .reduce((s, [, v]) => s + v, 0)
    setTotalUnits(otherSum + total)
    setSelection(new Set())
  }

  function openContextMenu(e, day) {
    e.preventDefault()
    e.stopPropagation()
    if (!selection.has(day) && selection.size === 0) {
      setSelection(new Set([day]))
    }
    const menuWidth = 320
    const menuMaxHeight = 460
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8)
    const y = Math.min(e.clientY, window.innerHeight - menuMaxHeight - 8)
    setContextMenu({ x, y, day })
  }

  function buildMenuItems() {
    const selArr = Array.from(selection).sort()
    const n = selArr.length
    const items = []

    if (n === 1) {
      const day = selArr[0]
      const hasFuture = monthDays.some((d) => d > day && !pinned.has(d))
      items.push({
        label: 'Штуки для этого дня…',
        hint: hasFuture
          ? 'Разница будет разложена пропорционально по следующим дням'
          : 'Дней после этого нет — total может перестать сходиться',
        action: () => {
          setContextMenu(null)
          setInputPrompt({
            title: formatDayLabel(day),
            hint: hasFuture
              ? 'Остаток перераспределится на дни после'
              : undefined,
            defaultValue: overrides[day] || 0,
            onSubmit: (v) => {
              editDayRolling(day, v)
              setSelection(new Set())
            }
          })
        }
      })
      if (overrides[day] != null) {
        items.push({
          label: 'Очистить это значение',
          action: () => {
            clearDayOverride(day)
            setSelection(new Set())
            setContextMenu(null)
          }
        })
      }
    }

    if (n > 1) {
      items.push({
        label: `Одинаковые штуки на выбранные (${n})…`,
        action: () => {
          setContextMenu(null)
          setInputPrompt({
            title: `Одинаковые штуки на ${n} дн.`,
            hint: 'Общий план обновится',
            defaultValue: Math.round(totalUnits / n),
            onSubmit: (v) => setSameUnitsForDays(selArr, v)
          })
        }
      })
      items.push({
        label: `Разделить общее число на ${n} выбранных…`,
        action: () => {
          setContextMenu(null)
          setInputPrompt({
            title: `Разделить на ${n} дн.`,
            hint: 'Каждый получит ≈ равную долю',
            defaultValue: totalUnits,
            onSubmit: (t) => distributeAmongDays(selArr, t)
          })
        }
      })
    }

    if (n > 0) {
      const allPinned = selArr.every((d) => pinned.has(d))
      items.push({ divider: true })
      items.push({
        label: allPinned
          ? n === 1
            ? 'Открепить значение'
            : `Открепить ${n} дн.`
          : n === 1
          ? 'Закрепить значение'
          : `Закрепить ${n} дн.`,
        hint: allPinned
          ? 'Пресеты снова смогут менять эти дни'
          : 'Пресеты и пересчёт total не будут менять эти дни',
        action: () => {
          togglePinned(selArr)
          setContextMenu(null)
        }
      })
      items.push({
        label: 'Снять выделение',
        action: () => {
          setSelection(new Set())
          setContextMenu(null)
        }
      })
    }

    items.push({ divider: true })
    items.push({
      label: `Разделить общий план на все дни (${monthDays.length})…`,
      action: () => {
        setContextMenu(null)
        setInputPrompt({
          title: `Разделить на ${monthDays.length} дн.`,
          hint: 'Все дни получат равные доли',
          defaultValue: totalUnits,
          onSubmit: (t) => distributeAmongDays(monthDays, t)
        })
      }
    })
    items.push({
      label: 'Одинаковые штуки на все дни…',
      action: () => {
        setContextMenu(null)
        setInputPrompt({
          title: 'Одинаковые штуки на каждый день',
          hint: 'Общий план обновится',
          defaultValue: Math.round(totalUnits / monthDays.length),
          onSubmit: (v) => setSameUnitsForDays(monthDays, v)
        })
      }
    })

    items.push({ divider: true })
    const setSelPreset = (daysArr) => {
      setSelection(new Set(daysArr))
      setContextMenu(null)
    }
    items.push({
      label: 'Выделить…',
      submenu: [
        { label: 'Все будни', action: () => setSelPreset(presetDaySets.workdays) },
        { label: 'Все выходные', action: () => setSelPreset(presetDaySets.weekends) },
        { label: 'Все чётные', action: () => setSelPreset(presetDaySets.even) },
        { label: 'Все нечётные', action: () => setSelPreset(presetDaySets.odd) },
        { label: 'Все дни', action: () => setSelPreset(presetDaySets.all) }
      ]
    })

    if (pinned.size > 0) {
      items.push({ divider: true })
      items.push({
        label: `Открепить все (${pinned.size})`,
        action: () => {
          clearAllPinned()
          setContextMenu(null)
        }
      })
    }

    if (Object.keys(overrides).length > 0 || pinned.size > 0) {
      items.push({ divider: true })
      items.push({
        label: 'Очистить весь план',
        danger: true,
        action: () => {
          setOverrides({})
          setPinned(new Set())
          setContextMenu(null)
        }
      })
    }

    return items
  }

  return (
    <>
      <TopBar />
      <div className="page">
        <button className="back" onClick={onBack}>
          ← Назад к списку
        </button>
        <div className="detail-header">
          <div>
            <p className="brand-crumb">{beer.brand}</p>
            <h1>{beer.name}</h1>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">План на {getMonthLabel(currentMonthKey)}</div>
            <div className="stat-value">{formatNumber(totalUnits)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Задано</div>
            <div className="stat-value">{formatNumber(distributedTotal)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Дней с планом</div>
            <div className="stat-value">{Object.keys(overrides).length}</div>
          </div>
        </div>

        <PlanCalendar
          monthDays={monthDays}
          selection={selection}
          onSelectionChange={setSelection}
          overrides={overrides}
          percents={percents}
          totalUnits={totalUnits}
          onTotalChange={handleTotalChange}
          distributedTotal={distributedTotal}
          onCellContextMenu={openContextMenu}
          onApplyPreset={applyPreset}
          pinned={pinned}
        />

        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={buildMenuItems()}
            onClose={() => setContextMenu(null)}
          />
        )}

        {inputPrompt && (
          <InputPrompt
            title={inputPrompt.title}
            hint={inputPrompt.hint}
            defaultValue={inputPrompt.defaultValue}
            onSubmit={(n) => {
              inputPrompt.onSubmit(n)
              setInputPrompt(null)
            }}
            onCancel={() => setInputPrompt(null)}
          />
        )}
      </div>
    </>
  )
}

function formatDayLabel(day) {
  return new Date(day).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long'
  })
}

function PlanCalendar({
  monthDays,
  selection,
  onSelectionChange,
  overrides,
  percents,
  totalUnits,
  onTotalChange,
  distributedTotal,
  onCellContextMenu,
  onApplyPreset,
  pinned
}) {
  const weeks = useMemo(() => buildCalendarWeeks(monthDays), [monthDays])
  const monthLabel = useMemo(() => getMonthLabel(currentMonthKey), [])

  const calendarBodyRef = useRef(null)
  const marqueeStartRef = useRef(null)
  const baseSelectionRef = useRef(new Set())
  const additiveRef = useRef(false)
  const draggedRef = useRef(false)
  const [marquee, setMarquee] = useState(null)

  const DRAG_THRESHOLD = 4

  function getBodyPoint(clientX, clientY) {
    const body = calendarBodyRef.current
    if (!body) return { x: 0, y: 0 }
    const r = body.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  function computeIntersection(rect) {
    const body = calendarBodyRef.current
    if (!body) return new Set()
    const bodyRect = body.getBoundingClientRect()
    const minX = Math.min(rect.startX, rect.currentX)
    const maxX = Math.max(rect.startX, rect.currentX)
    const minY = Math.min(rect.startY, rect.currentY)
    const maxY = Math.max(rect.startY, rect.currentY)
    const hit = new Set()
    const cells = body.querySelectorAll('.ship-cell[data-day]')
    for (const cell of cells) {
      const r = cell.getBoundingClientRect()
      const cx1 = r.left - bodyRect.left
      const cy1 = r.top - bodyRect.top
      const cx2 = r.right - bodyRect.left
      const cy2 = r.bottom - bodyRect.top
      if (cx1 < maxX && cx2 > minX && cy1 < maxY && cy2 > minY) {
        hit.add(cell.dataset.day)
      }
    }
    return hit
  }

  useEffect(() => {
    function onMove(e) {
      const start = marqueeStartRef.current
      if (!start) return
      const { x, y } = getBodyPoint(e.clientX, e.clientY)
      const dx = Math.abs(x - start.startX)
      const dy = Math.abs(y - start.startY)
      if (!draggedRef.current && dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return
      draggedRef.current = true
      const rect = { startX: start.startX, startY: start.startY, currentX: x, currentY: y }
      setMarquee(rect)
      const hit = computeIntersection(rect)
      if (additiveRef.current) {
        const merged = new Set(baseSelectionRef.current)
        for (const d of hit) merged.add(d)
        onSelectionChange(merged)
      } else {
        onSelectionChange(hit)
      }
    }
    function onUp(e) {
      const start = marqueeStartRef.current
      if (!start) return
      const wasDragged = draggedRef.current
      marqueeStartRef.current = null
      draggedRef.current = false
      setMarquee(null)
      if (wasDragged) return
      const day = start.cellDay
      if (day) {
        if (additiveRef.current) {
          const next = new Set(baseSelectionRef.current)
          if (next.has(day)) next.delete(day)
          else next.add(day)
          onSelectionChange(next)
        } else {
          onSelectionChange(new Set([day]))
        }
      } else if (!additiveRef.current) {
        onSelectionChange(new Set())
      }
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection])

  function onBodyMouseDown(e) {
    if (e.button !== 0) return
    if (e.target.closest('.context-menu')) return
    const { x, y } = getBodyPoint(e.clientX, e.clientY)
    const cellEl = e.target.closest('.ship-cell[data-day]')
    const cellDay = cellEl ? cellEl.dataset.day : null
    marqueeStartRef.current = { startX: x, startY: y, cellDay }
    additiveRef.current = e.shiftKey || e.metaKey || e.ctrlKey
    baseSelectionRef.current = new Set(selection)
    draggedRef.current = false
    e.preventDefault()
  }

  const isOver = distributedTotal > totalUnits

  return (
    <div className="ship-panel">
      <div className="ship-toolbar">
        <span className="ship-month">{monthLabel}</span>
        <div className="ship-total-input">
          <span className="ship-total-input-prefix">План</span>
          <TotalInput value={totalUnits} onCommit={onTotalChange} />
          <span className="ship-total-suffix">шт</span>
        </div>
        <div className="ship-summary">
          <span className={`ship-summary-num ${isOver ? 'is-over' : ''}`}>
            {formatNumber(distributedTotal)}
          </span>
          <span>задано из {formatNumber(totalUnits)}</span>
        </div>
      </div>

      <div className="ship-progress">
        <div
          className={`ship-progress-bar ${isOver ? 'is-over' : ''}`}
          style={{
            width: `${totalUnits > 0 ? Math.min(100, (distributedTotal / totalUnits) * 100) : 0}%`
          }}
        />
      </div>

      <div className="preset-row">
        <span className="preset-label">Распределить:</span>
        {DISTRIBUTION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className="chip preset-chip"
            onClick={() => onApplyPreset?.(preset.id)}
            title={preset.hint}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="ship-hint-row">
        Зажми и веди мышкой — прямоугольник выделения (Shift/⌘ — добавить к выделению) · правый клик — меню действий
      </div>

      <div className="ship-calendar">
        <div className="calendar-head">
          {WEEK_DOW_LABELS.map((d) => (
            <div key={d} className="calendar-head-cell">
              {d}
            </div>
          ))}
        </div>
        <div
          className="calendar-body has-marquee"
          ref={calendarBodyRef}
          onMouseDown={onBodyMouseDown}
        >
          {weeks.map((week, wi) => (
            <div key={wi} className="calendar-row">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="ship-cell empty" />
                const info = dayInfo(day)
                const isSelected = selection.has(day)
                const hasOverride = overrides[day] != null
                const isPinned = pinned?.has(day)
                const units = overrides[day] || 0
                const pct = percents[day] || 0
                return (
                  <button
                    key={day}
                    data-day={day}
                    className={`ship-cell ${isSelected ? 'is-selected' : ''} ${info.isToday ? 'today' : ''} ${info.isPast ? 'past' : ''} ${info.isWeekend ? 'weekend' : ''} ${hasOverride ? 'has-override' : ''} ${isPinned ? 'is-pinned' : ''}`}
                    onContextMenu={(e) => onCellContextMenu(e, day)}
                    onDragStart={(e) => e.preventDefault()}
                    aria-pressed={isSelected}
                    title={isPinned ? 'Закреплено — пресеты не будут менять этот день' : undefined}
                  >
                    <span className="ship-cell-day">{info.num}</span>
                    {info.isToday && <span className="ship-cell-today-chip">сегодня</span>}
                    {isPinned && <span className="ship-cell-pin" aria-hidden="true" />}
                    {hasOverride && (
                      <>
                        <span className="ship-cell-units">{formatNumber(units)}</span>
                        <span className="ship-cell-pct">{pct.toFixed(1)}%</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
          {marquee && (
            <div
              className="selection-marquee"
              style={{
                left: Math.min(marquee.startX, marquee.currentX),
                top: Math.min(marquee.startY, marquee.currentY),
                width: Math.abs(marquee.currentX - marquee.startX),
                height: Math.abs(marquee.currentY - marquee.startY)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const RU_WEEKDAYS = [
  { dow: 1, label: 'Пн' },
  { dow: 2, label: 'Вт' },
  { dow: 3, label: 'Ср' },
  { dow: 4, label: 'Чт' },
  { dow: 5, label: 'Пт' },
  { dow: 6, label: 'Сб' },
  { dow: 0, label: 'Вс' }
]

function ShipmentCalendar({
  shipmentDays,
  selection,
  onSelectionChange,
  totalUnits,
  onTotalChange,
  perDayUnits,
  percents,
  overrides,
  distributedTotal,
  onCellContextMenu
}) {
  const monthDays = useMemo(() => getMonthDays(currentMonthKey), [])
  const weeks = useMemo(() => buildCalendarWeeks(monthDays), [monthDays])
  const monthLabel = useMemo(() => getMonthLabel(currentMonthKey), [])

  const dragModeRef = useRef(null)
  const dragCurrentRef = useRef(new Set())

  useEffect(() => {
    function endDrag() {
      dragModeRef.current = null
      dragCurrentRef.current = new Set()
    }
    document.addEventListener('mouseup', endDrag)
    return () => document.removeEventListener('mouseup', endDrag)
  }, [])

  function startDrag(e, day) {
    if (e.button !== 0) return
    const isSelected = selection.has(day)
    dragModeRef.current = isSelected ? 'remove' : 'add'
    const next = new Set(selection)
    if (dragModeRef.current === 'add') next.add(day)
    else next.delete(day)
    dragCurrentRef.current = next
    onSelectionChange(next)
  }

  function continueDrag(day) {
    const mode = dragModeRef.current
    if (!mode) return
    const cur = dragCurrentRef.current
    if (mode === 'add' && cur.has(day)) return
    if (mode === 'remove' && !cur.has(day)) return
    const next = new Set(cur)
    if (mode === 'add') next.add(day)
    else next.delete(day)
    dragCurrentRef.current = next
    onSelectionChange(next)
  }

  function daysWhere(predicate) {
    return monthDays.filter((d) => predicate(new Date(d)))
  }

  function smartToggle(days) {
    if (days.length === 0) return
    const allSelected = days.every((d) => selection.has(d))
    const next = new Set(selection)
    if (allSelected) days.forEach((d) => next.delete(d))
    else days.forEach((d) => next.add(d))
    onSelectionChange(next)
  }

  function isFullySelected(days) {
    return days.length > 0 && days.every((d) => selection.has(d))
  }

  const weekdays = RU_WEEKDAYS.map(({ dow, label }) => ({
    dow,
    label,
    days: daysWhere((d) => d.getDay() === dow)
  }))

  return (
    <div className="ship-panel">
      <div className="ship-toolbar">
        <span className="ship-month">{monthLabel}</span>
        <div className="ship-total-input">
          <span className="ship-total-input-prefix">План</span>
          <input
            type="number"
            min="0"
            value={totalUnits}
            onChange={(e) => onTotalChange(Math.max(0, Number(e.target.value) || 0))}
          />
          <span className="ship-total-suffix">шт</span>
        </div>
        <div className="ship-summary">
          <span className={`ship-summary-num ${distributedTotal > totalUnits ? 'is-over' : ''}`}>
            {formatNumber(distributedTotal)}
          </span>
          <span>распределено из {formatNumber(totalUnits)}</span>
        </div>
      </div>

      <div className="ship-progress">
        <div
          className={`ship-progress-bar ${distributedTotal > totalUnits ? 'is-over' : ''}`}
          style={{
            width: `${totalUnits > 0 ? Math.min(100, (distributedTotal / totalUnits) * 100) : 0}%`
          }}
        />
      </div>

      <div className="ship-controls">
        <div className="chip-row">
          {weekdays.map(({ dow, label, days }) => (
            <button
              key={dow}
              className={`chip ${isFullySelected(days) ? 'chip-active' : ''}`}
              onClick={() => smartToggle(days)}
              title={`Все ${label.toLowerCase()}`}
            >
              {label}
            </button>
          ))}
          <button
            className="chip chip-clear"
            onClick={() => onSelectionChange(new Set())}
            disabled={selection.size === 0}
          >
            Снять выделение
          </button>
        </div>
        <div className="ship-hint-row">
          Клик/перетаскивание — выделение · правый клик — меню действий · пункты меню назначают ship-дни и штуки на выделенные
        </div>
      </div>

      <div className="ship-calendar">
        <div className="calendar-head">
          {WEEK_DOW_LABELS.map((d) => (
            <div key={d} className="calendar-head-cell">
              {d}
            </div>
          ))}
        </div>
        <div className="calendar-body">
          {weeks.map((week, wi) => (
            <div key={wi} className="calendar-row">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="ship-cell empty" />
                const info = dayInfo(day)
                const isSelected = selection.has(day)
                const isShipDay = shipmentDays.has(day)
                const units = perDayUnits[day] || 0
                const pct = percents[day] || 0
                const hasOverride = overrides[day] != null
                return (
                  <button
                    key={day}
                    className={`ship-cell ${isSelected ? 'is-selected' : ''} ${isShipDay ? 'is-shipday' : ''} ${info.isToday ? 'today' : ''} ${info.isPast ? 'past' : ''} ${info.isWeekend ? 'weekend' : ''} ${hasOverride ? 'has-override' : ''}`}
                    onMouseDown={(e) => startDrag(e, day)}
                    onMouseEnter={() => continueDrag(day)}
                    onContextMenu={(e) => onCellContextMenu(e, day)}
                    onDragStart={(e) => e.preventDefault()}
                    aria-pressed={isSelected}
                  >
                    <span className="ship-cell-day">{info.num}</span>
                    {isShipDay && hasOverride && (
                      <>
                        <span className="ship-cell-units">{formatNumber(units)}</span>
                        <span className="ship-cell-pct">{pct.toFixed(1)}%</span>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Локальный буфер ввода: rescale в модели фаерится только на commit
// (blur или Enter), а не на каждое нажатие клавиши. Иначе промежуточное
// значение 0 (при select-all → набор нового числа) обнулило бы форму
// распределения и незакреплённые дни не смогли бы восстановиться.
function TotalInput({ value, onCommit }) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  function commit() {
    const n = Math.max(0, Number(text) || 0)
    if (n !== value) onCommit(n)
    else setText(String(value))
  }

  return (
    <input
      type="number"
      min="0"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setText(String(value))
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function ContextMenu({ x, y, items, onClose }) {
  const [openSubmenu, setOpenSubmenu] = useState(null)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (e.target.closest('.context-menu') || e.target.closest('.context-submenu')) return
      onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('contextmenu', handler)
    function esc(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('contextmenu', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  function scheduleClose() {
    clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => setOpenSubmenu(null), 120)
  }
  function cancelClose() {
    clearTimeout(closeTimerRef.current)
  }
  function openAt(i) {
    cancelClose()
    setOpenSubmenu(i)
  }

  return (
    <div className="context-menu" style={{ left: x, top: y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) => {
        if (item.divider) return <div key={i} className="context-menu-divider" />
        if (item.submenu) {
          const isOpen = openSubmenu === i
          return (
            <div
              key={i}
              className="context-menu-sub"
              onMouseEnter={() => openAt(i)}
              onMouseLeave={scheduleClose}
            >
              <button
                className={`context-menu-item has-submenu ${isOpen ? 'is-active' : ''}`}
                title={item.hint}
                onClick={() => openAt(i)}
              >
                <span>{item.label}</span>
                <span className="submenu-arrow" aria-hidden="true">›</span>
              </button>
              {isOpen && (
                <div
                  className="context-submenu"
                  onMouseEnter={cancelClose}
                  onMouseLeave={scheduleClose}
                >
                  {item.submenu.map((sub, j) => (
                    <button
                      key={j}
                      className={`context-menu-item ${sub.danger ? 'is-danger' : ''}`}
                      onClick={sub.action}
                      title={sub.hint}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          <button
            key={i}
            className={`context-menu-item ${item.danger ? 'is-danger' : ''}`}
            onClick={item.action}
            title={item.hint}
            onMouseEnter={() => openAt(null)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function InputPrompt({ title, hint, defaultValue, onSubmit, onCancel }) {
  const [value, setValue] = useState(String(defaultValue))
  function submit() {
    const n = Math.max(0, parseInt(value, 10) || 0)
    onSubmit(n)
  }
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        {hint && <div className="dialog-hint">{hint}</div>}
        <input
          className="dialog-input"
          type="number"
          min="0"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="dialog-actions">
          <button className="dialog-cancel" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Применить
          </button>
        </div>

      </div>
    </div>
  )
}
