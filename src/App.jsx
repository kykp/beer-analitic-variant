import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  beerData as initialBeerData,
  chains,
  defaultChainId,
  currentMonthKey,
  getMonthDays,
  getMonthLabel,
  getEditableDays,
  shiftMonth,
  EDITABLE_LEAD_DAYS,
  ACTUAL_LAG_DAYS,
  getActualCutoffDate,
  todayStr
} from './mockData.js'
import lentaLogo from './assets/chains/lenta.svg'
import pyaterochkaLogo from './assets/chains/pyaterochka.svg'
import perekrestokLogo from './assets/chains/perekrestok.svg'

const CHAIN_LOGOS = {
  lenta: lentaLogo,
  pyaterochka: pyaterochkaLogo,
  perekrestok: perekrestokLogo
}

function formatNumber(n) {
  return n.toLocaleString('ru-RU')
}

function LockIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <rect
        x="2.5"
        y="5.5"
        width="7"
        height="5"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  )
}

function KebabIcon() {
  return (
    <svg
      width="4"
      height="16"
      viewBox="0 0 4 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="2" cy="2" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="2" cy="14" r="1.5" />
    </svg>
  )
}

function dayInfo(dateStr) {
  const d = new Date(dateStr)
  const dow = d.toLocaleDateString('ru-RU', { weekday: 'short' })
  return {
    num: d.getDate(),
    dow,
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
    isWeekEnd: d.getDay() === 0,
    isPast: dateStr < todayStr,
    isToday: dateStr === todayStr
  }
}

const BRAND_COLOR_PALETTE = [
  '#2563eb', '#7c3aed', '#059669', '#dc2626',
  '#d97706', '#0891b2', '#db2777', '#65a30d',
  '#4338ca', '#ea580c'
]

function brandColor(brand) {
  let hash = 0
  for (let i = 0; i < brand.length; i++) {
    hash = (hash * 31 + brand.charCodeAt(i)) | 0
  }
  return BRAND_COLOR_PALETTE[Math.abs(hash) % BRAND_COLOR_PALETTE.length]
}

function intensity(value, max) {
  if (!max || max <= 0) return 0
  return Math.min(1, Math.max(0, value / max))
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
  return beers.map((beer) => {
    const plan = loadBeerPlan(beer.id)
    if (!plan) return beer
    const salesByDay = { ...beer.salesByDay }
    for (const [day, val] of Object.entries(plan.overrides)) {
      salesByDay[day] = val
    }
    return { ...beer, salesByDay }
  })
}

export default function App() {
  const [beers, setBeers] = useState(() => applyPlansToBeers(initialBeerData))
  const [selectedId, setSelectedId] = useState(null)
  const [selectedBrand, setSelectedBrand] = useState(null)
  const [selectedChainId, setSelectedChainId] = useState(defaultChainId)
  const [collapsedBrands, setCollapsedBrands] = useState(() => {
    const brands = new Set()
    initialBeerData.forEach((b) => brands.add(b.brand))
    return brands
  })
  const [rowMenu, setRowMenu] = useState(null)
  const [brandMenu, setBrandMenu] = useState(null)
  const [viewMode, setViewMode] = useState('plan') // 'plan' | 'variance'
  const [activeMonthKey, setActiveMonthKey] = useState(currentMonthKey)

  const availableMonths = useMemo(() => {
    // текущий месяц + 3 вперёд
    return [0, 1, 2, 3].map((delta) => {
      const key = shiftMonth(currentMonthKey, delta)
      return { key, label: getMonthLabel(key) }
    })
  }, [])

  function openRowMenu(e, beerId) {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 200
    const menuMaxHeight = 200
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8)
    const y = Math.min(e.clientY, window.innerHeight - menuMaxHeight - 8)
    setRowMenu({ x, y, beerId })
  }

  function editBeerFromKebab(e, beerId) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedId(beerId)
  }

  function editBrandFromKebab(e, brand) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedBrand(brand)
  }

  function openBrandMenu(e, brand) {
    e.preventDefault()
    e.stopPropagation()
    const menuWidth = 220
    const menuMaxHeight = 200
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8)
    const y = Math.min(e.clientY, window.innerHeight - menuMaxHeight - 8)
    setBrandMenu({ x, y, brand })
  }

  const monthDays = useMemo(() => getMonthDays(activeMonthKey), [activeMonthKey])
  const monthLabel = useMemo(() => getMonthLabel(activeMonthKey), [activeMonthKey])
  const editableDays = useMemo(
    () => new Set(getEditableDays(activeMonthKey, EDITABLE_LEAD_DAYS)),
    [activeMonthKey]
  )

  const isApproved = false

  const remainingDays = useMemo(
    () => monthDays.filter((d) => d >= todayStr),
    [monthDays]
  )

  const beerRows = useMemo(
    () =>
      beers
        .filter((b) => b.chainIds?.includes(selectedChainId))
        .map((b) => {
          const total = monthDays.reduce((s, d) => s + b.salesByDay[d], 0)
          const remaining = remainingDays.reduce((s, d) => s + (b.salesByDay[d] || 0), 0)
          const rowMax = monthDays.reduce((m, d) => Math.max(m, b.salesByDay[d] || 0), 0)
          return { ...b, monthTotal: total, remaining, rowMax }
        }),
    [beers, monthDays, remainingDays, selectedChainId]
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
      const remaining = skus.reduce((s, b) => s + b.remaining, 0)
      const rowMax = Object.values(byDay).reduce((m, v) => Math.max(m, v), 0)
      return { brand, skus, byDay, monthTotal, remaining, rowMax }
    })
  }, [beerRows, monthDays])

  const totals = useMemo(() => {
    const byDay = {}
    for (const day of monthDays) {
      byDay[day] = beerRows.reduce((s, b) => s + b.salesByDay[day], 0)
    }
    const grand = Object.values(byDay).reduce((s, v) => s + v, 0)
    const remaining = beerRows.reduce((s, b) => s + b.remaining, 0)
    const rowMax = Object.values(byDay).reduce((m, v) => Math.max(m, v), 0)
    return { byDay, grand, remaining, rowMax }
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
  const brandBeers = useMemo(
    () =>
      selectedBrand
        ? beers.filter(
            (b) => b.brand === selectedBrand && b.chainIds?.includes(selectedChainId)
          )
        : [],
    [beers, selectedBrand, selectedChainId]
  )

  function updateBeerSales(beerId, nextSalesByDay) {
    setBeers((prev) => prev.map((b) => (b.id === beerId ? { ...b, salesByDay: nextSalesByDay } : b)))
  }

  // Раскидывает totalUnits гл по SKU выбранного бренда на дни targetDays.
  // Веса дней = текущая сумма продаж бренда по дню.
  // Веса SKU внутри дня = текущая доля этого SKU в дневной сумме бренда.
  // Если сумма нулевая — распределяем равномерно.
  // Значения ДОБАВЛЯЮТСЯ к текущим, а не заменяют.
  function addShipmentToBrandOnDays(brand, totalUnits, targetDays) {
    if (totalUnits <= 0 || !targetDays || targetDays.length === 0) return
    const targetBeers = beers.filter(
      (b) => b.brand === brand && b.chainIds?.includes(selectedChainId)
    )
    if (targetBeers.length === 0) return

    const dayList = targetDays.filter(
      (d) => d >= todayStr && (!isApproved || editableDays.has(d))
    )
    if (dayList.length === 0) return

    const brandDayWeight = {}
    for (const d of dayList) {
      brandDayWeight[d] = targetBeers.reduce((s, b) => s + (b.salesByDay[d] || 0), 0)
    }
    const weightSum = dayList.reduce((s, d) => s + brandDayWeight[d], 0)

    const addByDay = {}
    if (weightSum > 0) {
      const parts = dayList.map((day) => {
        const exact = totalUnits * (brandDayWeight[day] / weightSum)
        const floor = Math.floor(exact)
        return { day, floor, frac: exact - floor }
      })
      let leftover = totalUnits - parts.reduce((s, p) => s + p.floor, 0)
      parts.sort((a, b) => b.frac - a.frac)
      for (let i = 0; i < parts.length && leftover > 0; i++) {
        parts[i].floor += 1
        leftover -= 1
      }
      for (const p of parts) addByDay[p.day] = p.floor
    } else {
      const per = Math.floor(totalUnits / dayList.length)
      let leftover = totalUnits - per * dayList.length
      for (const d of dayList) {
        addByDay[d] = per + (leftover > 0 ? 1 : 0)
        if (leftover > 0) leftover -= 1
      }
    }

    const skuAdds = new Map()
    for (const day of dayList) {
      const addForDay = addByDay[day] || 0
      if (addForDay === 0) continue
      const skuValues = targetBeers.map((b) => ({ id: b.id, val: b.salesByDay[day] || 0 }))
      const skuSum = skuValues.reduce((s, x) => s + x.val, 0)

      let parts
      if (skuSum > 0) {
        parts = skuValues.map(({ id, val }) => {
          const exact = addForDay * (val / skuSum)
          const floor = Math.floor(exact)
          return { id, floor, frac: exact - floor }
        })
      } else {
        const per = Math.floor(addForDay / skuValues.length)
        parts = skuValues.map(({ id }) => ({ id, floor: per, frac: 0 }))
      }
      let leftover = addForDay - parts.reduce((s, p) => s + p.floor, 0)
      parts.sort((a, b) => b.frac - a.frac)
      for (let i = 0; i < parts.length && leftover > 0; i++) {
        parts[i].floor += 1
        leftover -= 1
      }

      for (const p of parts) {
        if (!skuAdds.has(p.id)) skuAdds.set(p.id, {})
        skuAdds.get(p.id)[day] = p.floor
      }
    }

    setBeers((prev) =>
      prev.map((b) => {
        if (!skuAdds.has(b.id)) return b
        const perDayAdd = skuAdds.get(b.id)
        const nextSales = { ...b.salesByDay }
        for (const [day, add] of Object.entries(perDayAdd)) {
          nextSales[day] = (nextSales[day] || 0) + add
        }

        // Снапшотим все дни месяца в overrides, чтобы applyPlansToBeers
        // на следующей загрузке не занулил дни, которых нет в overrides.
        const existing = loadBeerPlan(b.id) || {
          overrides: {},
          totalUnits: 5000,
          pinned: new Set()
        }
        const nextOverrides = { ...existing.overrides }
        for (const day of monthDays) {
          nextOverrides[day] = nextSales[day] || 0
        }
        const nextTotal = Object.values(nextOverrides).reduce((s, v) => s + v, 0)
        saveBeerPlan(b.id, {
          shipmentDays: [],
          overrides: nextOverrides,
          totalUnits: nextTotal,
          pinned: existing.pinned || new Set()
        })
        return { ...b, salesByDay: nextSales }
      })
    )
  }

  const [pendingChainId, setPendingChainId] = useState(null)

  function goHome() {
    setSelectedId(null)
    setSelectedBrand(null)
  }

  function handleSelectChain(id) {
    if (id === selectedChainId) return
    setPendingChainId(id)
  }

  function confirmChainSwitch() {
    if (pendingChainId == null) return
    setSelectedChainId(pendingChainId)
    setPendingChainId(null)
    goHome()
  }

  function cancelChainSwitch() {
    setPendingChainId(null)
  }

  const topbarProps = {
    onHome: goHome,
    chains,
    selectedChainId,
    onSelectChain: handleSelectChain,
    chainLogos: CHAIN_LOGOS,
    pendingChainId,
    onConfirmChainSwitch: confirmChainSwitch,
    onCancelChainSwitch: cancelChainSwitch
  }

  if (selected) {
    return (
      <BeerDetails
        key={selected.id + ':' + activeMonthKey}
        beer={selected}
        monthKey={activeMonthKey}
        onBack={() => setSelectedId(null)}
        onHome={goHome}
        onChange={(next) => updateBeerSales(selected.id, next)}
        isApproved={isApproved}
        editableDays={editableDays}
        topbarProps={topbarProps}
      />
    )
  }

  if (selectedBrand) {
    const remainingTargetDays = monthDays.filter(
      (d) => d >= todayStr && (!isApproved || editableDays.has(d))
    )
    return (
      <BrandDetails
        key={selectedBrand + ':' + activeMonthKey}
        brand={selectedBrand}
        beers={brandBeers}
        monthKey={activeMonthKey}
        onBack={() => setSelectedBrand(null)}
        onHome={goHome}
        onAddShipment={(units) =>
          addShipmentToBrandOnDays(selectedBrand, units, remainingTargetDays)
        }
        onAddShipmentOnDays={(days, units) =>
          addShipmentToBrandOnDays(selectedBrand, units, days)
        }
        isApproved={isApproved}
        editableDays={editableDays}
        topbarProps={topbarProps}
      />
    )
  }

  const selectedChain = chains.find((c) => c.id === selectedChainId)
  const selectedChainName = selectedChain?.name ?? ''
  const selectedChainColor = selectedChain?.color

  return (
    <>
      <TopBar {...topbarProps} />
      <div className="page">
        <div className="toolbar">
          <div className="toolbar-heading">
            <p className="eyebrow">План продаж</p>
            <h1 className="chain-title">
              {selectedChainColor && (
                <span
                  className="chain-title-dot"
                  style={{ background: selectedChainColor }}
                  aria-hidden="true"
                />
              )}
              {selectedChainName}
            </h1>
            <p className="subtitle">
              {monthLabel} · план на месяц <strong>{formatNumber(totals.grand)}</strong> гл
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
        <div className="month-tabs" role="tablist" aria-label="Выбор месяца">
          {availableMonths.map((m) => {
            const isActive = m.key === activeMonthKey
            const isCurrent = m.key === currentMonthKey
            return (
              <button
                key={m.key}
                role="tab"
                aria-selected={isActive}
                className={`month-tab ${isActive ? 'is-active' : ''} ${isCurrent ? 'is-current' : ''}`}
                onClick={() => setActiveMonthKey(m.key)}
                title={isCurrent ? 'Текущий месяц' : m.label}
              >
                {m.label}
              </button>
            )
          })}
        </div>
        <div className="view-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={viewMode === 'plan'}
            className={`view-tab ${viewMode === 'plan' ? 'is-active' : ''}`}
            onClick={() => setViewMode('plan')}
          >
            План
          </button>
          <button
            role="tab"
            aria-selected={viewMode === 'variance'}
            className={`view-tab ${viewMode === 'variance' ? 'is-active' : ''}`}
            onClick={() => setViewMode('variance')}
            title={`Факт приходит с лагом ${ACTUAL_LAG_DAYS} дн.`}
          >
            План vs Факт
          </button>
        </div>

        {viewMode === 'variance' ? (
          <VarianceView
            beers={beerRows}
            brandGroups={brandGroups}
            monthDays={monthDays}
            monthKey={activeMonthKey}
            collapsedBrands={collapsedBrands}
            toggleBrand={toggleBrand}
          />
        ) : (
          <>
        <div className="table-wrap">
          <div className="table-scroll">
            <table className="beer-table days-table">
              <thead>
                <tr>
                  <th className="sticky-col name-col">Наименование</th>
                  <th className="actions-col" aria-label="Действия"></th>
                  {monthDays.map((day) => {
                    const h = dayInfo(day)
                    return (
                      <th
                        key={day}
                        className={`num day-col ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${h.isWeekEnd ? 'week-end' : ''}`}
                      >
                        <div className="day-num">{h.num}</div>
                        <div className="day-dow">{h.dow}</div>
                      </th>
                    )
                  })}
                  <th className="num remaining-col" title="Сколько осталось не отгружено — с сегодняшнего дня до конца месяца">
                    Осталось
                  </th>
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
                        style={{ '--brand-color': brandColor(group.brand) }}
                        onContextMenu={(e) => openBrandMenu(e, group.brand)}
                      >
                        <td
                          className="sticky-col name-col brand-toggle"
                          onClick={() => toggleBrand(group.brand)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              toggleBrand(group.brand)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-expanded={!isCollapsed}
                          aria-label={`${group.brand}: ${isCollapsed ? 'развернуть' : 'свернуть'} список SKU`}
                        >
                          <div className="brand-name-cell">
                            <span className="chevron">{isCollapsed ? '›' : '⌄'}</span>
                            <div className="brand-name-stack">
                              <span className="brand-title">{group.brand}</span>
                              <span className="brand-meta">{group.skus.length} SKU</span>
                            </div>
                          </div>
                        </td>
                        <td className="actions-col brand-day">
                          <button
                            type="button"
                            className="kebab-btn brand-kebab"
                            aria-label={`Действия для категории «${group.brand}»`}
                            title="Действия"
                            onClick={(e) => editBrandFromKebab(e, group.brand)}
                          >
                            <KebabIcon />
                          </button>
                        </td>
                        {monthDays.map((day) => {
                          const h = dayInfo(day)
                          return (
                            <td
                              key={day}
                              style={{ '--intensity': intensity(group.byDay[day] || 0, group.rowMax) }}
                              className={`num day-col brand-day ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${h.isWeekEnd ? 'week-end' : ''}`}
                            >
                              {group.byDay[day]}
                            </td>
                          )
                        })}
                        <td className="num remaining-col brand-day">
                          <div className="cell-stack">
                            <span>{formatNumber(group.remaining)}</span>
                            <span className="cell-sub">
                              {group.monthTotal > 0
                                ? Math.round((group.remaining / group.monthTotal) * 100)
                                : 0}
                              %
                            </span>
                          </div>
                        </td>
                        <td className="num total-col brand-day">
                          <div className="cell-stack">
                            <span>{formatNumber(group.monthTotal)}</span>
                            <span className="cell-sub">
                              {formatNumber(Math.round(group.monthTotal / monthDays.length))}/день
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed &&
                        group.skus.map((beer) => (
                          <tr
                            key={beer.id}
                            className="sku-row"
                            onContextMenu={(e) => openRowMenu(e, beer.id)}
                          >
                            <td className="sticky-col name-col beer-name">
                              <span className="beer-name-clamp" title={beer.name}>
                                {beer.name}
                              </span>
                            </td>
                            <td className="actions-col">
                              <button
                                type="button"
                                className="kebab-btn"
                                aria-label={`Действия для «${beer.name}»`}
                                title="Действия"
                                onClick={(e) => editBeerFromKebab(e, beer.id)}
                              >
                                <KebabIcon />
                              </button>
                            </td>
                            {monthDays.map((day) => {
                              const h = dayInfo(day)
                              return (
                                <td
                                  key={day}
                                  style={{ '--intensity': intensity(beer.salesByDay[day] || 0, beer.rowMax) }}
                                  className={`num day-col ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${h.isWeekEnd ? 'week-end' : ''}`}
                                >
                                  {beer.salesByDay[day]}
                                </td>
                              )
                            })}
                            <td className="num remaining-col">
                              <div className="cell-stack">
                                <span>{formatNumber(beer.remaining)}</span>
                                <span className="cell-sub">
                                  {beer.monthTotal > 0
                                    ? Math.round((beer.remaining / beer.monthTotal) * 100)
                                    : 0}
                                  %
                                </span>
                              </div>
                            </td>
                            <td className="num total-col strong">
                              <div className="cell-stack">
                                <span>{formatNumber(beer.monthTotal)}</span>
                                <span className="cell-sub">
                                  {formatNumber(Math.round(beer.monthTotal / monthDays.length))}/день
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                })}
                <tr className="total-row">
                  <td className="sticky-col name-col strong" colSpan={2}>Итого за день</td>
                  {monthDays.map((day) => {
                    const h = dayInfo(day)
                    return (
                      <td
                        key={day}
                        style={{ '--intensity': intensity(totals.byDay[day] || 0, totals.rowMax) }}
                        className={`num day-col strong ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${h.isWeekEnd ? 'week-end' : ''}`}
                      >
                        {totals.byDay[day]}
                      </td>
                    )
                  })}
                  <td className="num remaining-col strong">
                    <div className="cell-stack">
                      <span>{formatNumber(totals.remaining)}</span>
                      <span className="cell-sub">
                        {totals.grand > 0
                          ? Math.round((totals.remaining / totals.grand) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  </td>
                  <td className="num total-col strong">
                    <div className="cell-stack">
                      <span>{formatNumber(totals.grand)}</span>
                      <span className="cell-sub">
                        {formatNumber(Math.round(totals.grand / monthDays.length))}/день
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p className="hint">
          Клик по названию бренда — свернуть/развернуть. Кнопка ⋯ в начале строки — «Изменить
          план»; правый клик открывает контекстное меню.
        </p>

        {rowMenu && (
          <ContextMenu
            x={rowMenu.x}
            y={rowMenu.y}
            minWidth={180}
            items={[
              {
                label: 'Изменить план',
                action: () => {
                  setSelectedId(rowMenu.beerId)
                  setRowMenu(null)
                }
              }
            ]}
            onClose={() => setRowMenu(null)}
          />
        )}

        {brandMenu && (
          <ContextMenu
            x={brandMenu.x}
            y={brandMenu.y}
            minWidth={220}
            items={[
              {
                label: 'Изменить план категории',
                hint: 'Календарь по бренду + добавить отгрузку сразу на все SKU',
                action: () => {
                  setSelectedBrand(brandMenu.brand)
                  setBrandMenu(null)
                }
              }
            ]}
            onClose={() => setBrandMenu(null)}
          />
        )}
          </>
        )}
      </div>
    </>
  )
}

function TopBar({
  onHome,
  chains: chainList,
  selectedChainId,
  onSelectChain,
  chainLogos,
  pendingChainId,
  onConfirmChainSwitch,
  onCancelChainSwitch
}) {
  const currentChain = chainList?.find((c) => c.id === selectedChainId)
  const pendingChain =
    pendingChainId != null
      ? chainList?.find((c) => c.id === pendingChainId)
      : null
  return (
    <>
      <div
        className="topbar"
        style={
          currentChain?.color
            ? { '--current-brand-color': currentChain.color }
            : undefined
        }
      >
        <div className="topbar-inner">
          <div
            className="topbar-brand"
            role={onHome ? 'button' : undefined}
            tabIndex={onHome ? 0 : undefined}
            onClick={onHome}
            onKeyDown={(e) => {
              if (!onHome) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onHome()
              }
            }}
            title={onHome ? 'На главную' : undefined}
            style={onHome ? { cursor: 'pointer' } : undefined}
          >
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
        {chainList && chainList.length > 0 && (
          <NetworkBar
            chains={chainList}
            selectedChainId={selectedChainId}
            onSelectChain={onSelectChain}
            logos={chainLogos || {}}
          />
        )}
      </div>
      {pendingChain && currentChain && (
        <ConfirmChainSwitchDialog
          from={currentChain}
          to={pendingChain}
          fromLogo={chainLogos?.[currentChain.id]}
          toLogo={chainLogos?.[pendingChain.id]}
          onCancel={onCancelChainSwitch}
          onConfirm={onConfirmChainSwitch}
        />
      )}
    </>
  )
}

function ConfirmChainSwitchDialog({
  from,
  to,
  fromLogo,
  toLogo,
  onCancel,
  onConfirm
}) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel?.()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div
        className="dialog chain-switch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chain-switch-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-title" id="chain-switch-title">
          Переключить сеть?
        </div>
        <div className="chain-switch-flow">
          <div className="chain-switch-step-label">Сейчас</div>
          <span aria-hidden="true" />
          <div className="chain-switch-step-label">Переключить на</div>
          <div
            className="chain-switch-card is-from"
            style={{ '--brand-color': from.color || '#111827' }}
          >
            {fromLogo && (
              <img
                src={fromLogo}
                alt={from.hasWordmark ? from.name : ''}
                className="chain-switch-card-logo"
              />
            )}
            {!from.hasWordmark && (
              <span className="chain-switch-card-name">{from.name}</span>
            )}
          </div>
          <span className="chain-switch-arrow" aria-hidden="true">
            →
          </span>
          <div
            className="chain-switch-card is-to"
            style={{ '--brand-color': to.color || '#111827' }}
          >
            {toLogo && (
              <img
                src={toLogo}
                alt={to.hasWordmark ? to.name : ''}
                className="chain-switch-card-logo"
              />
            )}
            {!to.hasWordmark && (
              <span className="chain-switch-card-name">{to.name}</span>
            )}
          </div>
        </div>
        <p className="chain-switch-note">
          План «{from.name}» сохранён — вернётесь и продолжите. План «{to.name}
          » откроется на главной.
        </p>
        <div className="dialog-actions">
          <button className="btn" onClick={onCancel}>
            Отмена
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            autoFocus
            style={{ '--brand-color': to.color || '#111827' }}
          >
            Переключить
          </button>
        </div>
      </div>
    </div>
  )
}

function NetworkBar({ chains: chainList, selectedChainId, onSelectChain, logos }) {
  return (
    <div className="network-bar">
      <div className="network-bar-inner">
        <span className="network-bar-label">Сеть</span>
        <div
          className="network-tabs"
          role="tablist"
          aria-label="Выбор торговой сети"
        >
          {chainList.map((chain) => {
            const isActive = chain.id === selectedChainId
            const brandColor = chain.color || '#111827'
            const hideLabel = Boolean(chain.hasWordmark && logos[chain.id])
            return (
              <button
                key={chain.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={chain.name}
                className={`network-tab ${isActive ? 'is-active' : ''}`}
                style={{ '--brand-color': brandColor }}
                onClick={() => onSelectChain?.(chain.id)}
                title={chain.name}
              >
                {logos[chain.id] && (
                  <img
                    src={logos[chain.id]}
                    alt={hideLabel ? chain.name : ''}
                    className="network-tab-logo"
                  />
                )}
                {!hideLabel && (
                  <span className="network-tab-label">{chain.name}</span>
                )}
              </button>
            )
          })}
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

function BeerDetails({ beer, monthKey = currentMonthKey, onBack, onChange, isApproved = false, editableDays, topbarProps }) {
  const [overrides, setOverrides] = useState(() => loadBeerPlan(beer.id)?.overrides || {})
  const [totalUnits, setTotalUnits] = useState(() => loadBeerPlan(beer.id)?.totalUnits ?? 5000)
  const [pinned] = useState(() => loadBeerPlan(beer.id)?.pinned || new Set())
  const [selection, setSelection] = useState(() => new Set())
  const [contextMenu, setContextMenu] = useState(null)
  const [inputPrompt, setInputPrompt] = useState(null)

  const monthDays = useMemo(() => getMonthDays(monthKey), [monthKey])
  const editableSet = useMemo(
    () => editableDays instanceof Set ? editableDays : new Set(editableDays || []),
    [editableDays]
  )
  const isDayEditable = (day) => editableSet.has(day)

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

  function applyPreset(presetId) {
    if (isApproved) return
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
    if (isApproved) return
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

  // Раскладывает targetSum равномерно по daysArr, ЗАМЕЩАЯ их значения. Total не трогаем —
  // используется для «заполнить недобор» (гэп между totalUnits и distributedTotal распределяется
  // по выделенным пустым дням, доводя distributedTotal до totalUnits).
  function fillDaysEvenly(daysArr, targetSum) {
    if (daysArr.length === 0) return
    const clean = Math.max(0, Math.round(targetSum))
    const per = Math.floor(clean / daysArr.length)
    const remainder = clean - per * daysArr.length
    setOverrides((prev) => {
      const next = { ...prev }
      daysArr.forEach((d, i) => {
        next[d] = per + (i === daysArr.length - 1 ? remainder : 0)
      })
      return next
    })
  }

  // Bulk-снятие значений с выделенных дней; total идёт за суммой (уменьшается на удалённое).
  function clearDaysRolling(daysArr) {
    if (daysArr.length === 0) return
    const totalRemoved = daysArr.reduce((s, d) => s + (overrides[d] || 0), 0)
    setOverrides((prev) => {
      const next = { ...prev }
      daysArr.forEach((d) => delete next[d])
      return next
    })
    if (totalRemoved > 0) setTotalUnits((t) => Math.max(0, t - totalRemoved))
  }

  // Ставим значение дня напрямую; total идёт за суммой (delta прибавляется к totalUnits).
  function editDayRolling(day, units) {
    if (!isDayEditable(day)) return
    const clean = Math.max(0, Math.round(units))
    const prev = overrides[day] || 0
    const delta = clean - prev
    setOverrides((prevMap) => ({ ...prevMap, [day]: clean }))
    if (delta !== 0) setTotalUnits((t) => Math.max(0, t + delta))
  }

  function clearDayOverride(day) {
    const prev = overrides[day] || 0
    setOverrides((prevMap) => {
      const next = { ...prevMap }
      delete next[day]
      return next
    })
    if (prev > 0) setTotalUnits((t) => Math.max(0, t - prev))
  }

  function setSameUnitsForDays(daysArr, units) {
    if (isApproved) return
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
    if (isApproved) return
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
    if (!isDayEditable(day)) return
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
    const selArr = Array.from(selection).sort().filter(isDayEditable)
    const n = selArr.length
    const items = []

    const gap = totalUnits - distributedTotal
    const allSelEmpty = n > 0 && selArr.every((d) => (overrides[d] || 0) === 0)
    if (gap > 0 && allSelEmpty) {
      items.push({
        label: `Заполнить недобор (${formatNumber(gap)} гл)`,
        hint:
          n === 1
            ? 'Впишет сюда весь текущий недобор плана'
            : `Раскинет ${formatNumber(gap)} гл равномерно на ${n} выделенных дн.`,
        action: () => {
          fillDaysEvenly(selArr, gap)
          setSelection(new Set())
          setContextMenu(null)
        }
      })
    }

    if (n === 1) {
      const day = selArr[0]
      const prev = overrides[day] || 0
      const hasValue = prev > 0
      items.push({
        label: hasValue ? 'Изменить количество…' : 'Добавить отгрузку…',
        action: () => {
          setContextMenu(null)
          setInputPrompt({
            title: formatDayLabel(day),
            defaultValue: prev,
            onSubmit: (v) => {
              editDayRolling(day, v)
              setSelection(new Set())
            }
          })
        }
      })
      if (hasValue) {
        items.push({
          label: 'Убрать отгрузку',
          action: () => {
            clearDayOverride(day)
            setSelection(new Set())
            setContextMenu(null)
          }
        })
      }
    }

    if (n > 1) {
      const anyHasValueMulti = selArr.some((d) => (overrides[d] || 0) > 0)
      if (!isApproved) {
        items.push({
          label: anyHasValueMulti
            ? `Изменить одинаково (${n})…`
            : `Добавить одинаково (${n})…`,
          action: () => {
            setContextMenu(null)
            setInputPrompt({
              title: anyHasValueMulti
                ? `Изменить одинаково на ${n} дн.`
                : `Добавить одинаково на ${n} дн.`,
              hint: 'Общий план обновится',
              defaultValue: Math.round(totalUnits / n),
              onSubmit: (v) => setSameUnitsForDays(selArr, v)
            })
          }
        })
        items.push({
          label: `Равномерно распределить на ${n}…`,
          action: () => {
            setContextMenu(null)
            setInputPrompt({
              title: `Распределить на ${n} дн.`,
              hint: 'Каждый получит ≈ равную долю',
              defaultValue: totalUnits,
              onSubmit: (t) => distributeAmongDays(selArr, t)
            })
          }
        })
      }
      if (anyHasValueMulti) {
        items.push({
          label: `Убрать отгрузки (${n})`,
          action: () => {
            clearDaysRolling(selArr)
            setSelection(new Set())
            setContextMenu(null)
          }
        })
      }
    }

    if (!isApproved) {
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
        label: 'Одинаково гл на все дни…',
        action: () => {
          setContextMenu(null)
          setInputPrompt({
            title: 'Одинаково гл на каждый день',
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

      if (Object.keys(overrides).length > 0) {
        items.push({ divider: true })
        items.push({
          label: 'Очистить весь план',
          danger: true,
          action: () => {
            setOverrides({})
            setContextMenu(null)
          }
        })
      }
    }

    return items
  }

  return (
    <>
      <TopBar {...(topbarProps || {})} />
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
            <div className="stat-label">План на {getMonthLabel(monthKey)}</div>
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

        <div className="plan-layout">
          <PlanCalendar
            monthDays={monthDays}
            monthKey={monthKey}
            selection={selection}
            onSelectionChange={setSelection}
            overrides={overrides}
            percents={percents}
            totalUnits={totalUnits}
            onTotalChange={handleTotalChange}
            distributedTotal={distributedTotal}
            onCellContextMenu={openContextMenu}
            pinned={pinned}
            isApproved={isApproved}
            isDayEditable={isDayEditable}
          />
          <PlanRail
            monthDays={monthDays}
            selection={selection}
            onSelectionChange={setSelection}
            overrides={overrides}
            totalUnits={totalUnits}
            pinned={pinned}
            isApproved={isApproved}
            isDayEditable={isDayEditable}
            onApplyPreset={applyPreset}
            onSetSameUnits={setSameUnitsForDays}
            onDistribute={distributeAmongDays}
            onEditDayRolling={editDayRolling}
            onClearDaysRolling={clearDaysRolling}
            onFillDaysEvenly={fillDaysEvenly}
            distributedTotal={distributedTotal}
            onPrompt={setInputPrompt}
          />
        </div>

        {contextMenu && (() => {
          const items = buildMenuItems()
          while (items.length && items[0].divider) items.shift()
          while (items.length && items[items.length - 1].divider) items.pop()
          if (items.length === 0) return null
          return (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={items}
              onClose={() => setContextMenu(null)}
            />
          )
        })()}

        {inputPrompt && (
          <InputPrompt
            title={inputPrompt.title}
            hint={inputPrompt.hint}
            defaultValue={inputPrompt.defaultValue}
            max={inputPrompt.max}
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

function BrandDetails({
  brand,
  beers,
  monthKey = currentMonthKey,
  onBack,
  onAddShipment,
  onAddShipmentOnDays,
  isApproved = false,
  editableDays,
  topbarProps
}) {
  const monthDays = useMemo(() => getMonthDays(monthKey), [monthKey])
  const weeks = useMemo(() => buildCalendarWeeks(monthDays), [monthDays])
  const monthLabel = useMemo(() => getMonthLabel(monthKey), [monthKey])
  const editableSet = useMemo(
    () => (editableDays instanceof Set ? editableDays : new Set(editableDays || [])),
    [editableDays]
  )
  const isDayEditable = (day) => editableSet.has(day)

  const [selection, setSelection] = useState(() => new Set())
  const [inputPrompt, setInputPrompt] = useState(null)

  // Стабильная палитра для SKU (index по отсортированному id) — один цвет на SKU
  // по всему календарю; используется и в stack-bar внутри ячейки, и в rail-легенде.
  const skuColors = useMemo(() => {
    // Палитра без коллизии с UI --accent (#2563eb), с усиленным контрастом и
    // разведёнными соседями по спектру (bg — белый, WCAG AA для non-text ≥3:1).
    const palette = [
      '#059669', '#d97706', '#dc2626', '#7c3aed',
      '#0e7490', '#db2777', '#65a30d', '#f97316',
      '#0284c7', '#4338ca'
    ]
    const sorted = [...beers].sort((a, b) => (a.id > b.id ? 1 : -1))
    const map = {}
    sorted.forEach((b, i) => {
      map[b.id] = palette[i % palette.length]
    })
    return map
  }, [beers])

  const brandByDay = useMemo(() => {
    const map = {}
    for (const day of monthDays) {
      map[day] = beers.reduce((s, b) => s + (b.salesByDay[day] || 0), 0)
    }
    return map
  }, [beers, monthDays])

  const monthTotal = useMemo(
    () => Object.values(brandByDay).reduce((s, v) => s + v, 0),
    [brandByDay]
  )

  const remainingTotal = useMemo(
    () =>
      monthDays
        .filter((d) => d >= todayStr)
        .reduce((s, d) => s + brandByDay[d], 0),
    [brandByDay, monthDays]
  )

  const maxDay = useMemo(
    () => monthDays.reduce((m, d) => Math.max(m, brandByDay[d] || 0), 0),
    [brandByDay, monthDays]
  )

  const selArr = useMemo(() => Array.from(selection).sort(), [selection])
  const nSel = selArr.length

  const selSum = useMemo(
    () => selArr.reduce((s, d) => s + (brandByDay[d] || 0), 0),
    [selArr, brandByDay]
  )
  const selWorkdays = useMemo(
    () =>
      selArr.filter((d) => {
        const dow = new Date(d).getDay()
        return dow >= 1 && dow <= 5
      }).length,
    [selArr]
  )
  const selWeekends = nSel - selWorkdays

  const skuBreakdown = useMemo(() => {
    if (nSel === 0) return []
    return beers
      .map((b) => ({
        id: b.id,
        name: b.name,
        val: selArr.reduce((s, d) => s + (b.salesByDay[d] || 0), 0)
      }))
      .sort((a, b) => b.val - a.val)
  }, [beers, selArr, nSel])

  const weekRows = useMemo(() => {
    return weeks.map((week, i) => {
      const days = week.filter(Boolean)
      const sum = days.reduce((s, d) => s + (brandByDay[d] || 0), 0)
      const active = days.reduce(
        (s, d) => s + ((brandByDay[d] || 0) > 0 ? 1 : 0),
        0
      )
      const pct = monthTotal > 0 ? (sum / monthTotal) * 100 : 0
      return { i, days, sum, active, pct }
    })
  }, [weeks, brandByDay, monthTotal])

  const targetDaysCount = useMemo(
    () => monthDays.filter((d) => d >= todayStr && isDayEditable(d)).length,
    [monthDays, isApproved, editableSet] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const editableSelected = useMemo(
    () => selArr.filter((d) => d >= todayStr && isDayEditable(d)),
    [selArr, isApproved, editableSet] // eslint-disable-line react-hooks/exhaustive-deps
  )

  function openAddShipment() {
    if (targetDaysCount === 0) {
      setInputPrompt({
        title: 'Некуда добавлять',
        hint: isApproved
          ? 'В утверждённом плане не осталось editable-дней. Верни план в черновик, чтобы добавить отгрузку.'
          : 'В месяце не осталось будущих дней.',
        defaultValue: 0,
        onSubmit: () => {}
      })
      return
    }
    setInputPrompt({
      title: `Добавить отгрузку на «${brand}»`,
      hint: `Разложится по ${targetDaysCount} ${isApproved ? 'editable-дням' : 'оставшимся дням'} пропорционально текущим продажам бренда; внутри дня — по долям SKU`,
      defaultValue: 0,
      onSubmit: (v) => {
        if (v > 0) onAddShipment(v)
      }
    })
  }

  function openAddShipmentOnSelection() {
    if (editableSelected.length === 0) return
    setInputPrompt({
      title:
        nSel === 1
          ? `Отгрузка на ${formatDayLabel(selArr[0])}`
          : `Отгрузка на ${nSel} выделенных дн.`,
      hint:
        nSel === 1
          ? `Разложится по ${beers.length} SKU пропорционально их долям в этот день`
          : `Разложится по ${editableSelected.length} editable-дням пропорционально текущим продажам, внутри дня — по долям SKU`,
      defaultValue: 0,
      onSubmit: (v) => {
        if (v > 0) onAddShipmentOnDays(editableSelected, v)
      }
    })
  }

  // Marquee-выделение — копия механики из PlanCalendar.
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
    if (hit.size < 2) return hit
    let dMin = null
    let dMax = null
    for (const d of hit) {
      if (dMin === null || d < dMin) dMin = d
      if (dMax === null || d > dMax) dMax = d
    }
    const range = new Set()
    for (const cell of cells) {
      const d = cell.dataset.day
      if (d >= dMin && d <= dMax) range.add(d)
    }
    return range
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
        setSelection(merged)
      } else {
        setSelection(hit)
      }
    }
    function onUp() {
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
          setSelection(next)
        } else {
          setSelection(new Set([day]))
        }
      } else if (!additiveRef.current) {
        setSelection(new Set())
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
    const { x, y } = getBodyPoint(e.clientX, e.clientY)
    const cellEl = e.target.closest('.ship-cell[data-day]')
    const cellDay = cellEl ? cellEl.dataset.day : null
    marqueeStartRef.current = { startX: x, startY: y, cellDay }
    additiveRef.current = e.shiftKey || e.metaKey || e.ctrlKey
    baseSelectionRef.current = new Set(selection)
    draggedRef.current = false
    e.preventDefault()
  }

  function selectWeek(days) {
    setSelection(new Set(days))
  }

  function selectRemaining() {
    const remaining = monthDays.filter((d) => d >= todayStr && isDayEditable(d))
    setSelection(new Set(remaining))
  }

  return (
    <>
      <TopBar {...(topbarProps || {})} />
      <div className="page">
        <button className="back back-button" onClick={onBack}>
          ← Назад к списку
        </button>
        <div className="detail-topline">
          <div className="detail-topline-body">
            <div className="detail-topline-title">
              <span className="brand-crumb-inline">Категория</span>
              <span className="brand-crumb-sep">›</span>
              <h1>{brand}</h1>
            </div>
            <div className="detail-topline-stats">
              <div className="stat-inline stat-inline-primary">
                <span className="stat-inline-label">План на {monthLabel}</span>
                <span className="stat-inline-value">{formatNumber(monthTotal)}</span>
              </div>
              <div className="stat-inline">
                <span className="stat-inline-label">Осталось</span>
                <span className="stat-inline-value">{formatNumber(remainingTotal)}</span>
              </div>
              <div className="stat-inline">
                <span className="stat-inline-label">SKU</span>
                <span className="stat-inline-value">{beers.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="plan-layout">
          <div className="ship-panel">
            <div className="ship-toolbar">
              <span className="ship-month">{monthLabel}</span>
              <div className="brand-actions">
                <button
                  className="btn btn-primary"
                  onClick={openAddShipment}
                  title={
                    isApproved
                      ? 'Разложится только по editable-дням'
                      : 'Разложится по всем дням месяца'
                  }
                >
                  + Добавить отгрузку на категорию
                </button>
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
                      const units = brandByDay[day] || 0
                      const isLocked = !isDayEditable(day)
                      const isSelected = selection.has(day)
                      const intensity = maxDay > 0 ? units / maxDay : 0
                      return (
                        <button
                          key={day}
                          data-day={day}
                          className={`ship-cell brand-cell ${isSelected ? 'is-selected' : ''} ${info.isToday ? 'today' : ''} ${info.isPast ? 'past' : ''} ${info.isWeekend ? 'weekend' : ''} ${units > 0 ? 'has-override' : ''} ${isLocked ? 'is-locked' : ''}`}
                          style={{ '--intensity': intensity }}
                          onDragStart={(e) => e.preventDefault()}
                          aria-pressed={isSelected}
                          aria-disabled={isLocked || undefined}
                          title={
                            isLocked
                              ? 'План утверждён — этот день заблокирован для новых отгрузок'
                              : undefined
                          }
                        >
                          <span className="ship-cell-day">{info.num}</span>
                          {info.isToday && <span className="ship-cell-today-chip">сегодня</span>}
                          {isLocked && (
                            <span className="ship-cell-lock" aria-hidden="true">
                              <LockIcon />
                            </span>
                          )}
                          {units > 0 && (
                            <span className="ship-cell-units">{formatNumber(units)}</span>
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

            {selArr.length > 0 && (
              <div className="focus-cards-row">
                {selArr.map((day) => {
                  const units = brandByDay[day] || 0
                  const daySkus = beers
                    .map((b) => ({
                      id: b.id,
                      name: b.name,
                      val: b.salesByDay[day] || 0
                    }))
                    .filter((s) => s.val > 0)
                    .sort((a, b) => b.val - a.val)
                  const dayIsLocked = !isDayEditable(day)
                  return (
                    <div
                      key={day}
                      className={`focus-card ${dayIsLocked ? 'is-locked' : ''}`}
                    >
                      <div className="focus-card-head">
                        <div className="focus-card-date">{formatDayLabel(day)}</div>
                        {dayIsLocked && (
                          <span className="focus-card-badge">
                            <LockIcon />
                            <span>заблокирован</span>
                          </span>
                        )}
                        <div className="focus-card-units">
                          <span className="focus-card-units-num">{formatNumber(units)}</span>
                          <span className="focus-card-units-suffix">гл</span>
                        </div>
                      </div>
                      <div className="focus-card-sku-list">
                        {daySkus.length === 0 ? (
                          <div className="focus-card-empty">Продаж в этот день не было</div>
                        ) : (
                          daySkus.map((s) => {
                            const share = units > 0 ? (s.val / units) * 100 : 0
                            return (
                              <div key={s.id} className="focus-card-sku-row">
                                <span
                                  className="brand-cell-sku-dot"
                                  style={{ background: skuColors[s.id] }}
                                />
                                <span className="focus-card-sku-name">{s.name}</span>
                                <span className="focus-card-sku-val">
                                  {formatNumber(s.val)}
                                </span>
                                <span className="focus-card-sku-share">
                                  {share.toFixed(1)}%
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <aside className="plan-rail">
            <div className="rail-section">
              <div className="rail-section-head rail-section-head-plain">
                <span>По неделям</span>
              </div>
              <table className="rail-weeks-table">
                <tbody>
                  {weekRows.map((row) => (
                    <tr
                      key={row.i}
                      className="rail-week-row"
                      onClick={() => selectWeek(row.days)}
                      title="Кликни, чтобы выделить неделю"
                    >
                      <td className="rail-week-label">W{row.i + 1}</td>
                      <td className="rail-week-bar-cell">
                        <div className="rail-week-bar">
                          <div
                            className="rail-week-bar-fill"
                            style={{ width: `${Math.min(100, row.pct)}%` }}
                          />
                        </div>
                      </td>
                      <td className="rail-week-val">{formatNumber(row.sum)}</td>
                      <td className="rail-week-pct">{row.pct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rail-section">
              <div className="rail-section-head">
                <span>Выделение</span>
                <div className="rail-section-head-actions">
                  {targetDaysCount > 0 && (
                    <button
                      className="rail-clear-link"
                      onClick={selectRemaining}
                      title="Выделить все дни месяца, куда ещё можно внести отгрузку"
                    >
                      Оставшиеся ({targetDaysCount})
                    </button>
                  )}
                  {nSel > 0 && (
                    <button
                      className="rail-clear-link"
                      onClick={() => setSelection(new Set())}
                    >
                      Снять
                    </button>
                  )}
                </div>
              </div>
              {nSel === 0 ? (
                <div className="rail-empty">
                  <svg
                    className="rail-empty-icon"
                    viewBox="0 0 40 28"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="38"
                      height="26"
                      rx="4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  </svg>
                  <span>Выдели дни для действий</span>
                </div>
              ) : nSel === 1 ? (
                <>
                  <div className="rail-selection-stats">
                    <div className="rail-stat-main">
                      <span className="rail-single-date">{formatDayLabel(selArr[0])}</span>
                      {!isDayEditable(selArr[0]) && (
                        <span className="rail-locked-inline">
                          <LockIcon />
                          <span>заблокирован</span>
                        </span>
                      )}
                    </div>
                    <div className="rail-stat-side">
                      <span className="rail-stat-side-val">{formatNumber(selSum)} гл</span>
                      <span className="rail-stat-side-sub">
                        {skuBreakdown.filter((r) => r.val > 0).length} SKU
                      </span>
                    </div>
                  </div>
                  <div className="rail-actions">
                    <button
                      className="rail-action rail-action-primary"
                      onClick={openAddShipmentOnSelection}
                      disabled={editableSelected.length === 0}
                      title={
                        editableSelected.length === 0
                          ? isApproved
                            ? 'День не в editable-окне утверждённого плана'
                            : 'Прошедший день — отгрузку добавлять нельзя'
                          : ''
                      }
                    >
                      + Добавить отгрузку в этот день
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rail-selection-stats">
                    <div className="rail-stat-main">
                      <span className="rail-stat-val">{nSel}</span>
                      <span className="rail-stat-label">
                        {nSel < 5 ? 'дня' : 'дней'} · {formatNumber(selSum)} гл
                      </span>
                    </div>
                    <div className="rail-stat-side">
                      <span className="rail-stat-side-sub">будни {selWorkdays}</span>
                      <span className="rail-stat-side-sub">вых. {selWeekends}</span>
                    </div>
                    {nSel - editableSelected.length > 0 && (
                      <div className="rail-stat-full">
                        editable {editableSelected.length} · заблокировано{' '}
                        <span className="rail-stat-locked">
                          {nSel - editableSelected.length}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="rail-actions">
                    <button
                      className="rail-action rail-action-primary"
                      onClick={openAddShipmentOnSelection}
                      disabled={editableSelected.length === 0}
                      title={
                        editableSelected.length === 0
                          ? 'Нет ни одного editable-дня в выделении'
                          : editableSelected.length < nSel
                          ? `${nSel - editableSelected.length} из ${nSel} — заблокированы или прошедшие, отгрузка ляжет только на ${editableSelected.length}`
                          : ''
                      }
                    >
                      + Добавить отгрузку на {editableSelected.length === nSel ? `${nSel} дн.` : `${editableSelected.length} из ${nSel} дн.`}
                    </button>
                  </div>
                </>
              )}
            </div>

          </aside>
        </div>

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


function VarianceView({ beers, brandGroups, monthDays, monthKey = currentMonthKey, collapsedBrands, toggleBrand }) {
  const [metric, setMetric] = useState('delta') // delta | delta_pct | actual | plan
  const actualCutoff = useMemo(() => getActualCutoffDate(), [])
  const monthLabel = useMemo(() => getMonthLabel(monthKey), [monthKey])
  const actualCutoffLabel = useMemo(
    () =>
      new Date(actualCutoff).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long'
      }),
    [actualCutoff]
  )

  // Только дни этого месяца, по которым уже пришёл факт.
  const reportedDays = useMemo(
    () => monthDays.filter((d) => d <= actualCutoff),
    [monthDays, actualCutoff]
  )

  const skuRows = useMemo(
    () =>
      beers.map((beer) => {
        let planReported = 0
        let actualReported = 0
        for (const day of reportedDays) {
          planReported += beer.salesByDay[day] || 0
          actualReported += beer.actualByDay?.[day] ?? 0
        }
        const planMonth = monthDays.reduce((s, d) => s + (beer.salesByDay[d] || 0), 0)
        const deltaCum = actualReported - planReported
        const projectedPct =
          planReported > 0 ? (actualReported / planReported) * 100 : null
        return {
          ...beer,
          planMonth,
          planReported,
          actualReported,
          deltaCum,
          projectedPct
        }
      }),
    [beers, reportedDays, monthDays]
  )

  const brandRows = useMemo(
    () =>
      brandGroups.map((group) => {
        const skus = skuRows.filter((s) => s.brand === group.brand)
        const planMonth = skus.reduce((s, x) => s + x.planMonth, 0)
        const planReported = skus.reduce((s, x) => s + x.planReported, 0)
        const actualReported = skus.reduce((s, x) => s + x.actualReported, 0)
        const deltaCum = actualReported - planReported
        const projectedPct =
          planReported > 0 ? (actualReported / planReported) * 100 : null

        const planByDay = {}
        const actualByDay = {}
        for (const day of monthDays) {
          planByDay[day] = skus.reduce((s, x) => s + (x.salesByDay[day] || 0), 0)
          actualByDay[day] = skus.reduce(
            (s, x) => s + (x.actualByDay?.[day] ?? 0),
            0
          )
        }
        return {
          brand: group.brand,
          skus,
          planMonth,
          planReported,
          actualReported,
          deltaCum,
          projectedPct,
          planByDay,
          actualByDay
        }
      }),
    [brandGroups, skuRows, monthDays]
  )

  const kpi = useMemo(() => {
    const planMonth = brandRows.reduce((s, x) => s + x.planMonth, 0)
    const planReported = brandRows.reduce((s, x) => s + x.planReported, 0)
    const actualReported = brandRows.reduce((s, x) => s + x.actualReported, 0)
    const delta = actualReported - planReported
    const deltaPct = planReported > 0 ? (delta / planReported) * 100 : 0
    const projectedPct = planReported > 0 ? (actualReported / planReported) * 100 : null
    // Отставание в днях: |delta| / средний план в день (по отчётным дням)
    const avgDayPlan = reportedDays.length > 0 ? planReported / reportedDays.length : 0
    const lagDays = avgDayPlan > 0 ? delta / avgDayPlan : 0
    return { planMonth, planReported, actualReported, delta, deltaPct, projectedPct, lagDays }
  }, [brandRows, reportedDays])

  function colorForDelta(plan, delta) {
    if (plan <= 0) return ''
    const pct = (delta / plan) * 100
    if (pct <= -15) return 'var-red-strong'
    if (pct <= -5) return 'var-red'
    if (pct >= 15) return 'var-green-strong'
    if (pct >= 5) return 'var-green'
    return ''
  }

  function renderCellContent(plan, actual, day) {
    if (day > actualCutoff) {
      if (day > todayStr) {
        // Будущий день: факта не будет ещё долго.
        if (metric === 'plan') return { node: formatNumber(plan), cls: '' }
        if (metric === 'combined') {
          return {
            node: (
              <div className="var-cell-combined">
                <span className="plan">{formatNumber(plan)}</span>
                <span className="actual is-empty">—</span>
              </div>
            ),
            cls: ''
          }
        }
        return { node: '—', cls: 'var-empty' }
      }
      // Дни в окне лага: план есть, факт ещё придёт.
      if (metric === 'combined') {
        return {
          node: (
            <div className="var-cell-combined">
              <span className="plan">{formatNumber(plan)}</span>
              <span className="actual is-waiting">⏱</span>
            </div>
          ),
          cls: 'var-waiting',
          title: `Ждём факт (лаг ${ACTUAL_LAG_DAYS} дн.)`
        }
      }
      return {
        node: '⏱',
        cls: 'var-waiting',
        title: `Ждём факт (лаг ${ACTUAL_LAG_DAYS} дн.)`
      }
    }
    const delta = actual - plan
    const deltaPct = plan > 0 ? (delta / plan) * 100 : 0

    if (metric === 'combined') {
      const cls = colorForDelta(plan, delta)
      return {
        node: (
          <div className="var-cell-combined">
            <span className="plan">{formatNumber(plan)}</span>
            <span className="actual">{formatNumber(actual)}</span>
          </div>
        ),
        cls,
        title:
          plan > 0
            ? `План ${formatNumber(plan)} · Факт ${formatNumber(actual)} · Δ ${(delta >= 0 ? '+' : '') + formatNumber(delta)} (${(deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(1)}%)`
            : `План 0 · Факт ${formatNumber(actual)}`
      }
    }

    let value = ''
    let cls = ''
    if (metric === 'delta') {
      value = delta === 0 ? '0' : (delta > 0 ? '+' : '') + formatNumber(delta)
    } else if (metric === 'delta_pct') {
      if (plan === 0) value = actual > 0 ? '+∞' : '0%'
      else value = (delta >= 0 ? '+' : '') + deltaPct.toFixed(0) + '%'
    } else if (metric === 'actual') {
      value = formatNumber(actual)
    } else {
      value = formatNumber(plan)
    }
    if (metric === 'delta' || metric === 'delta_pct') {
      cls = colorForDelta(plan, delta)
    }
    return { node: value, cls }
  }

  const METRICS = [
    { id: 'combined', label: 'План + Факт' },
    { id: 'delta', label: 'Δ гл' },
    { id: 'delta_pct', label: 'Δ %' },
    { id: 'actual', label: 'Факт' },
    { id: 'plan', label: 'План' }
  ]

  const deltaSign = kpi.delta > 0 ? '+' : ''
  const kpiVariantClass =
    kpi.delta < 0 ? 'is-under' : kpi.delta > 0 ? 'is-over' : ''

  return (
    <>
      <div className="kpi-strip">
        <div className="kpi-item">
          <div className="kpi-label">План на {monthLabel}</div>
          <div className="kpi-value">{formatNumber(kpi.planMonth)}<span className="kpi-unit"> гл</span></div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Факт c начала месяца (по {actualCutoffLabel})</div>
          <div className="kpi-value">{formatNumber(kpi.actualReported)}<span className="kpi-unit"> гл</span></div>
          <div className="kpi-sub">ожидалось {formatNumber(kpi.planReported)} гл</div>
        </div>
        <div className={`kpi-item ${kpiVariantClass}`}>
          <div className="kpi-label">
            {kpi.delta < 0 ? 'Отставание' : kpi.delta > 0 ? 'Опережение' : 'В плане'}
          </div>
          <div className="kpi-value">
            {deltaSign}{formatNumber(kpi.delta)}<span className="kpi-unit"> гл</span>
          </div>
          <div className="kpi-sub">
            {deltaSign}{kpi.deltaPct.toFixed(1)}%{' '}
            {Math.abs(kpi.lagDays) >= 0.1 && (
              <>· ≈ {deltaSign}{kpi.lagDays.toFixed(1)} дн.</>
            )}
          </div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Прогноз выполнения</div>
          <div className="kpi-value">
            {kpi.projectedPct == null ? '—' : `${kpi.projectedPct.toFixed(0)}%`}
          </div>
          <div className="kpi-sub">если тренд сохранится</div>
        </div>
      </div>

      <div className="variance-toolbar">
        <div className="metric-toggle" role="tablist">
          {METRICS.map((m) => (
            <button
              key={m.id}
              className={`metric-chip ${metric === m.id ? 'is-active' : ''}`}
              onClick={() => setMetric(m.id)}
              role="tab"
              aria-selected={metric === m.id}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="variance-legend">
          <span className="legend-swatch var-red-strong" /> ≤ −15%
          <span className="legend-swatch var-red" /> −5..−15%
          <span className="legend-swatch var-green" /> +5..+15%
          <span className="legend-swatch var-green-strong" /> ≥ +15%
          <span className="legend-swatch var-waiting" /> ждём факт
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="beer-table days-table variance-table">
            <thead>
              <tr>
                <th className="sticky-col name-col">Наименование</th>
                {monthDays.map((day) => {
                  const h = dayInfo(day)
                  const isWaiting = day > actualCutoff && day <= todayStr
                  return (
                    <th
                      key={day}
                      className={`num day-col ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${isWaiting ? 'var-waiting-col' : ''}`}
                    >
                      <div className="day-num">{h.num}</div>
                      <div className="day-dow">{h.dow}</div>
                    </th>
                  )
                })}
                <th className="num remaining-col" title="Накопленная дельта (факт − план) с начала месяца">
                  Δ с начала
                </th>
                <th className="num total-col" title="Прогноз выполнения плана, если тренд сохранится">
                  Прогноз %
                </th>
              </tr>
            </thead>
            <tbody>
              {brandRows.map((group) => {
                const isCollapsed = collapsedBrands.has(group.brand)
                const groupDeltaSign = group.deltaCum > 0 ? '+' : ''
                const groupDeltaCls =
                  group.deltaCum < 0 ? 'var-red' : group.deltaCum > 0 ? 'var-green' : ''
                const projCls =
                  group.projectedPct == null
                    ? ''
                    : group.projectedPct < 95
                    ? 'var-red'
                    : group.projectedPct > 105
                    ? 'var-green'
                    : ''
                return (
                  <Fragment key={group.brand}>
                    <tr className={`brand-header ${isCollapsed ? 'is-collapsed' : ''}`}>
                      <td
                        className="sticky-col name-col brand-toggle"
                        onClick={() => toggleBrand(group.brand)}
                        role="button"
                        tabIndex={0}
                        aria-expanded={!isCollapsed}
                      >
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
                        const c = renderCellContent(
                          group.planByDay[day] || 0,
                          group.actualByDay[day] || 0,
                          day
                        )
                        return (
                          <td
                            key={day}
                            className={`num day-col brand-day ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${c.cls}`}
                            title={c.title}
                          >
                            {c.node}
                          </td>
                        )
                      })}
                      <td className={`num remaining-col brand-day ${groupDeltaCls}`}>
                        {groupDeltaSign}{formatNumber(group.deltaCum)}
                      </td>
                      <td className={`num total-col brand-day ${projCls}`}>
                        {group.projectedPct == null ? '—' : `${group.projectedPct.toFixed(0)}%`}
                      </td>
                    </tr>
                    {!isCollapsed &&
                      group.skus.map((beer) => {
                        const skuDeltaSign = beer.deltaCum > 0 ? '+' : ''
                        const skuDeltaCls =
                          beer.deltaCum < 0 ? 'var-red' : beer.deltaCum > 0 ? 'var-green' : ''
                        const skuProjCls =
                          beer.projectedPct == null
                            ? ''
                            : beer.projectedPct < 95
                            ? 'var-red'
                            : beer.projectedPct > 105
                            ? 'var-green'
                            : ''
                        return (
                          <tr key={beer.id} className="sku-row">
                            <td className="sticky-col name-col beer-name">
                              <span className="beer-name-clamp" title={beer.name}>
                                {beer.name}
                              </span>
                            </td>
                            {monthDays.map((day) => {
                              const h = dayInfo(day)
                              const c = renderCellContent(
                                beer.salesByDay[day] || 0,
                                beer.actualByDay?.[day] ?? 0,
                                day
                              )
                              return (
                                <td
                                  key={day}
                                  className={`num day-col ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${c.cls}`}
                                  title={c.title}
                                >
                                  {c.node}
                                </td>
                              )
                            })}
                            <td className={`num remaining-col ${skuDeltaCls}`}>
                              {skuDeltaSign}{formatNumber(beer.deltaCum)}
                            </td>
                            <td className={`num total-col strong ${skuProjCls}`}>
                              {beer.projectedPct == null ? '—' : `${beer.projectedPct.toFixed(0)}%`}
                            </td>
                          </tr>
                        )
                      })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="hint">
        Метрика в ячейке — по переключателю сверху. Цвет: красный — недо-, зелёный — переотгрузка
        (порог ±5%, «сильный» — ±15%). Заштрихованный — ждём факт (лаг {ACTUAL_LAG_DAYS} дн.,
        последняя дата — <strong>{actualCutoffLabel}</strong>).
      </p>
    </>
  )
}

function PlanRail({
  monthDays,
  selection,
  onSelectionChange,
  overrides,
  totalUnits,
  distributedTotal,
  pinned,
  isApproved,
  isDayEditable,
  onApplyPreset,
  onSetSameUnits,
  onDistribute,
  onEditDayRolling,
  onClearDaysRolling,
  onFillDaysEvenly,
  onPrompt
}) {
  const weeks = useMemo(() => buildCalendarWeeks(monthDays), [monthDays])

  const selArr = useMemo(
    () => Array.from(selection).sort().filter((d) => isDayEditable(d)),
    [selection, isDayEditable]
  )
  const nSel = selArr.length

  const selSum = useMemo(
    () => selArr.reduce((s, d) => s + (overrides[d] || 0), 0),
    [selArr, overrides]
  )
  const selWorkdays = useMemo(
    () => selArr.filter((d) => {
      const dow = new Date(d).getDay()
      return dow >= 1 && dow <= 5
    }).length,
    [selArr]
  )
  const selWeekends = nSel - selWorkdays
  const selPct = totalUnits > 0 ? (selSum / totalUnits) * 100 : 0
  const anySelHasValue = selArr.some((d) => (overrides[d] || 0) > 0)
  const singleDay = nSel === 1 ? selArr[0] : null
  const singleValue = singleDay ? (overrides[singleDay] || 0) : 0
  const singleHasValue = singleValue > 0

  const weekRows = useMemo(() => {
    return weeks.map((week, i) => {
      const days = week.filter(Boolean)
      const sum = days.reduce((s, d) => s + (overrides[d] || 0), 0)
      const active = days.reduce((s, d) => s + ((overrides[d] || 0) > 0 ? 1 : 0), 0)
      const pct = totalUnits > 0 ? (sum / totalUnits) * 100 : 0
      return { i, days, sum, active, pct }
    })
  }, [weeks, overrides, totalUnits])

  function selectWeek(days) {
    onSelectionChange(new Set(days))
  }

  function actionEditSingle() {
    if (!singleDay || !isDayEditable(singleDay)) return
    const day = singleDay
    const prev = overrides[day] || 0
    onPrompt({
      title: formatDayLabel(day),
      defaultValue: prev,
      onSubmit: (v) => {
        onEditDayRolling(day, v)
        onSelectionChange(new Set())
      }
    })
  }

  function actionSameUnits() {
    if (isApproved || nSel < 2) return
    onPrompt({
      title: anySelHasValue
        ? `Изменить одинаково на ${nSel} дн.`
        : `Добавить одинаково на ${nSel} дн.`,
      hint: 'Общий план обновится',
      defaultValue: nSel > 0 ? Math.round(totalUnits / nSel) : 0,
      onSubmit: (v) => onSetSameUnits(selArr, v)
    })
  }

  function actionDistribute() {
    if (isApproved || nSel < 2) return
    onPrompt({
      title: `Распределить на ${nSel} дн.`,
      hint: 'Каждый получит ≈ равную долю',
      defaultValue: totalUnits,
      onSubmit: (t) => onDistribute(selArr, t)
    })
  }

  function actionClearShipments() {
    if (nSel === 0) return
    onClearDaysRolling(selArr)
    onSelectionChange(new Set())
  }

  const gap = totalUnits - distributedTotal
  const allSelEmpty = nSel > 0 && selArr.every((d) => (overrides[d] || 0) === 0)
  const canFillGap = gap > 0 && allSelEmpty

  function actionFillGap() {
    if (!canFillGap) return
    onFillDaysEvenly(selArr, gap)
    onSelectionChange(new Set())
  }

  return (
    <aside className="plan-rail">
      <div className="rail-section">
        <div className="rail-section-head">
          <span>Выделение</span>
          {nSel > 0 && (
            <button
              className="rail-clear-link"
              onClick={() => onSelectionChange(new Set())}
            >
              Снять
            </button>
          )}
        </div>
        {nSel === 0 ? (
          <p className="rail-empty">
            Клик или зажми и веди мышкой по дням — здесь появятся действия. Shift/⌘ — добавить к выделению.
          </p>
        ) : nSel === 1 ? (
          <>
            <div className="rail-selection-stats">
              <div className="rail-stat">
                <span className="rail-single-date">{formatDayLabel(singleDay)}</span>
              </div>
              {singleHasValue && (
                <div className="rail-stat">
                  <span className="rail-stat-val">{formatNumber(singleValue)}</span>
                  <span className="rail-stat-label">гл · {selPct.toFixed(1)}%</span>
                </div>
              )}
            </div>
            <div className="rail-actions">
              {canFillGap && (
                <button
                  className="rail-action rail-action-primary"
                  onClick={actionFillGap}
                  title="Один клик — вписать сюда весь текущий недобор плана"
                >
                  Заполнить недобор ({formatNumber(gap)} гл)
                </button>
              )}
              <button
                className="rail-action"
                onClick={actionEditSingle}
                disabled={!isDayEditable(singleDay)}
              >
                {singleHasValue ? 'Изменить количество…' : 'Добавить значение…'}
              </button>
              {singleHasValue && (
                <>
                  <button
                    className="rail-action rail-action-danger"
                    onClick={actionClearShipments}
                  >
                    Убрать отгрузку
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="rail-selection-stats">
              <div className="rail-stat">
                <span className="rail-stat-val">{nSel}</span>
                <span className="rail-stat-label">
                  {nSel < 5 ? 'дня' : 'дней'}
                </span>
              </div>
              {anySelHasValue && (
                <div className="rail-stat">
                  <span className="rail-stat-val">{formatNumber(selSum)}</span>
                  <span className="rail-stat-label">гл · {selPct.toFixed(1)}%</span>
                </div>
              )}
              <div className="rail-stat rail-stat-split">
                <span className="rail-stat-sub">будни {selWorkdays}</span>
                <span className="rail-stat-sub">вых. {selWeekends}</span>
              </div>
            </div>
            <div className="rail-actions">
              {canFillGap && (
                <button
                  className="rail-action rail-action-primary"
                  onClick={actionFillGap}
                  title="Один клик — раскидать весь текущий недобор плана поровну на выделенные дни"
                >
                  Заполнить недобор ({formatNumber(gap)} гл)
                </button>
              )}
              <button className="rail-action" onClick={actionSameUnits}>
                {anySelHasValue ? 'Изменить одинаково…' : 'Добавить…'}
              </button>
              <button className="rail-action" onClick={actionDistribute}>
                Равномерно распределить…
              </button>
              {anySelHasValue && (
                <button
                  className="rail-action rail-action-danger"
                  onClick={actionClearShipments}
                >
                  Убрать отгрузки
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rail-section">
        <div className="rail-section-head">
          <span>Пресеты распределения</span>
        </div>
        <div className="rail-presets">
          {DISTRIBUTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="chip rail-preset-chip"
              onClick={() => onApplyPreset(preset.id)}
              title={isApproved ? 'План утверждён — пресеты заблокированы' : preset.hint}
              disabled={isApproved}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rail-section">
        <div className="rail-section-head">
          <span>По неделям</span>
        </div>
        <table className="rail-weeks-table">
          <tbody>
            {weekRows.map((row) => (
              <tr
                key={row.i}
                className="rail-week-row"
                onClick={() => selectWeek(row.days)}
                title="Кликни, чтобы выделить неделю"
              >
                <td className="rail-week-label">W{row.i + 1}</td>
                <td className="rail-week-bar-cell">
                  <div className="rail-week-bar">
                    <div
                      className="rail-week-bar-fill"
                      style={{ width: `${Math.min(100, row.pct)}%` }}
                    />
                  </div>
                </td>
                <td className="rail-week-val">{formatNumber(row.sum)}</td>
                <td className="rail-week-pct">{row.pct.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="rail-hint">
        Правый клик по дню — расширенное меню действий.
      </p>
    </aside>
  )
}

function PlanCalendar({
  monthDays,
  monthKey = currentMonthKey,
  selection,
  onSelectionChange,
  overrides,
  percents,
  totalUnits,
  onTotalChange,
  distributedTotal,
  onCellContextMenu,
  pinned,
  isApproved = false,
  isDayEditable = () => true
}) {
  const weeks = useMemo(() => buildCalendarWeeks(monthDays), [monthDays])
  const monthLabel = useMemo(() => getMonthLabel(monthKey), [monthKey])

  const panelRef = useRef(null)
  const marqueeStartRef = useRef(null)
  const baseSelectionRef = useRef(new Set())
  const additiveRef = useRef(false)
  const draggedRef = useRef(false)
  const [marquee, setMarquee] = useState(null)

  const DRAG_THRESHOLD = 4

  function getPanelPoint(clientX, clientY) {
    const el = panelRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  function computeIntersection(rect) {
    const el = panelRef.current
    if (!el) return new Set()
    const panelRect = el.getBoundingClientRect()
    const minX = Math.min(rect.startX, rect.currentX)
    const maxX = Math.max(rect.startX, rect.currentX)
    const minY = Math.min(rect.startY, rect.currentY)
    const maxY = Math.max(rect.startY, rect.currentY)
    const hit = new Set()
    const cells = el.querySelectorAll('.ship-cell[data-day]')
    for (const cell of cells) {
      const r = cell.getBoundingClientRect()
      const cx1 = r.left - panelRect.left
      const cy1 = r.top - panelRect.top
      const cx2 = r.right - panelRect.left
      const cy2 = r.bottom - panelRect.top
      if (cx1 < maxX && cx2 > minX && cy1 < maxY && cy2 > minY) {
        hit.add(cell.dataset.day)
      }
    }
    if (hit.size < 2) return hit
    let dMin = null
    let dMax = null
    for (const d of hit) {
      if (dMin === null || d < dMin) dMin = d
      if (dMax === null || d > dMax) dMax = d
    }
    const range = new Set()
    for (const cell of cells) {
      const d = cell.dataset.day
      if (d >= dMin && d <= dMax) range.add(d)
    }
    return range
  }

  useEffect(() => {
    function onMove(e) {
      const start = marqueeStartRef.current
      if (!start) return
      const { x, y } = getPanelPoint(e.clientX, e.clientY)
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

  function onPanelMouseDown(e) {
    if (e.button !== 0) return
    if (e.target.closest('.context-menu')) return
    // Не хватать mousedown у нативных контролов/тулбара — только по ячейке или пустому месту.
    const cellEl = e.target.closest('.ship-cell[data-day]')
    if (!cellEl && e.target.closest('input, textarea, select, button, a')) return
    const { x, y } = getPanelPoint(e.clientX, e.clientY)
    const cellDay = cellEl ? cellEl.dataset.day : null
    marqueeStartRef.current = { startX: x, startY: y, cellDay }
    additiveRef.current = e.shiftKey || e.metaKey || e.ctrlKey
    baseSelectionRef.current = new Set(selection)
    draggedRef.current = false
    e.preventDefault()
  }

  const isOver = distributedTotal > totalUnits

  return (
    <div
      className="ship-panel has-marquee"
      ref={panelRef}
      onMouseDown={onPanelMouseDown}
    >
      <div className="ship-toolbar">
        <span className="ship-month">{monthLabel}</span>
        <div className={`ship-total-input ${isApproved ? 'is-disabled' : ''}`}>
          <span className="ship-total-input-prefix">План</span>
          <TotalInput
            value={totalUnits}
            onCommit={onTotalChange}
            disabled={isApproved}
          />
          <span className="ship-total-suffix">гл</span>
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
                const units = overrides[day] || 0
                const hasOverride = overrides[day] != null && units > 0
                const isPinned = pinned?.has(day)
                const isLocked = !isDayEditable(day)
                const pct = percents[day] || 0
                return (
                  <button
                    key={day}
                    data-day={isLocked ? undefined : day}
                    className={`ship-cell ${isSelected ? 'is-selected' : ''} ${info.isToday ? 'today' : ''} ${info.isPast ? 'past' : ''} ${info.isWeekend ? 'weekend' : ''} ${hasOverride ? 'has-override' : ''} ${isPinned ? 'is-pinned' : ''} ${isLocked ? 'is-locked' : ''}`}
                    onContextMenu={(e) => onCellContextMenu(e, day)}
                    onDragStart={(e) => e.preventDefault()}
                    aria-pressed={isSelected}
                    aria-disabled={isLocked || undefined}
                    title={
                      isLocked
                        ? 'План утверждён — этот день заблокирован'
                        : isPinned
                        ? 'Закреплено — пресеты не будут менять этот день'
                        : undefined
                    }
                  >
                    <span className="ship-cell-day">{info.num}</span>
                    {info.isToday && <span className="ship-cell-today-chip">сегодня</span>}
                    {isLocked && (
                      <span className="ship-cell-lock" aria-hidden="true">
                        <LockIcon />
                      </span>
                    )}
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
          <span className="ship-total-suffix">гл</span>
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
          Клик/перетаскивание — выделение · правый клик — меню действий · пункты меню назначают ship-дни и гл на выделенные
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
function TotalInput({ value, onCommit, disabled = false }) {
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
      disabled={disabled}
      title={disabled ? 'План утверждён — общий план заблокирован' : undefined}
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

function ContextMenu({ x, y, items, onClose, minWidth }) {
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
    <div
      className="context-menu"
      style={{ left: x, top: y, ...(minWidth != null ? { minWidth } : null) }}
      onContextMenu={(e) => e.preventDefault()}
    >
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

function InputPrompt({ title, hint, defaultValue, onSubmit, onCancel, max }) {
  const [value, setValue] = useState(String(defaultValue))
  const parsed = Math.max(0, parseInt(value, 10) || 0)
  const hasMax = typeof max === 'number' && Number.isFinite(max)
  const overMax = hasMax && parsed > max
  const canSubmit = !overMax

  function handleChange(next) {
    if (hasMax) {
      const n = parseInt(next, 10)
      if (Number.isFinite(n) && n > max) {
        setValue(String(max))
        return
      }
    }
    setValue(next)
  }

  function submit() {
    if (!canSubmit) return
    onSubmit(parsed)
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        {hint && <div className="dialog-hint">{hint}</div>}
        {hasMax && (
          <div className={`dialog-hint dialog-hint-accent ${overMax ? 'is-error' : ''}`}>
            Максимум: {formatNumber(max)} гл
          </div>
        )}
        <input
          className={`dialog-input ${overMax ? 'is-error' : ''}`}
          type="number"
          min="0"
          max={hasMax ? max : undefined}
          value={value}
          autoFocus
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="dialog-actions">
          <button className="dialog-cancel" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            Применить
          </button>
        </div>
      </div>
    </div>
  )
}
