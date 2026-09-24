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

function MenuIcon({ name }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }
  switch (name) {
    case 'edit':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      )
    case 'trash':
      return (
        <svg {...common}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
      )
    case 'eraser':
      return (
        <svg {...common}>
          <path d="M20 20H8L3.5 15.5a1.5 1.5 0 0 1 0-2.1L13.4 3.5a1.5 1.5 0 0 1 2.1 0l5 5a1.5 1.5 0 0 1 0 2.1L11 20" />
          <path d="M8.5 8.5l7 7" />
        </svg>
      )
    case 'equals':
      return (
        <svg {...common}>
          <line x1="5" y1="9" x2="19" y2="9" />
          <line x1="5" y1="15" x2="19" y2="15" />
        </svg>
      )
    case 'split':
      return (
        <svg {...common}>
          <path d="M12 3v10" />
          <path d="M12 13l-5 8" />
          <path d="M12 13l5 8" />
          <circle cx="12" cy="3" r="1.25" />
        </svg>
      )
    case 'checkSquare':
      return (
        <svg {...common}>
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    case 'check':
      return (
        <svg {...common}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )
    case 'sparkles':
      return (
        <svg {...common}>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    default:
      return null
  }
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
    // Нули не персистим — они мусор от legacy-затирания в BeerDetails.
    // При реальной очистке дня ключ удаляется, а не выставляется в 0.
    const cleanOverrides = {}
    for (const [d, v] of Object.entries(state.overrides || {})) {
      if (v && v > 0) cleanOverrides[d] = v
    }
    localStorage.setItem(
      STORAGE_PREFIX + beerId,
      JSON.stringify({
        shipmentDays: Array.from(state.shipmentDays),
        overrides: cleanOverrides,
        totalUnits: state.totalUnits,
        pinned: Array.from(state.pinned || [])
      })
    )
  } catch {}
}

function applyPlansToBeers(beers) {
  return beers.map((beer) => {
    const plan = loadBeerPlan(beer.id)
    if (!plan) return beer
    const salesByDay = { ...beer.salesByDay }
    for (const [day, val] of Object.entries(plan.overrides)) {
      // Нулевые overrides из legacy-состояния (когда BeerDetails стартовал с пустым
      // overrides и sync-effect затирал salesByDay нулями) игнорируем — оставляем
      // baseline из mockData. Реальные пользовательские правки (>0) применяем.
      if (!val) continue
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
  const [hidePastInTable, setHidePastInTable] = useState(false)

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

  const visibleMonthDays = useMemo(
    () => (hidePastInTable ? monthDays.filter((d) => d >= todayStr) : monthDays),
    [monthDays, hidePastInTable]
  )
  const hasTodayInMonth = useMemo(() => monthDays.includes(todayStr), [monthDays])

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
  function addShipmentToBrandOnDays(brand, totalUnits, targetDays, skuIds) {
    if (totalUnits === 0 || !targetDays || targetDays.length === 0) return
    let targetBeers = beers.filter(
      (b) => b.brand === brand && b.chainIds?.includes(selectedChainId)
    )
    if (skuIds && skuIds.length > 0) {
      const skuSet = new Set(skuIds)
      targetBeers = targetBeers.filter((b) => skuSet.has(b.id))
    }
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
          nextSales[day] = Math.max(0, (nextSales[day] || 0) + add)
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
        topbarProps={topbarProps}
      />
    )
  }

  if (selectedBrand) {
    return (
      <BrandDetails
        key={selectedBrand + ':' + activeMonthKey}
        brand={selectedBrand}
        beers={brandBeers}
        monthKey={activeMonthKey}
        onBack={() => setSelectedBrand(null)}
        onHome={goHome}
        onAddShipmentOnDays={(days, units, skuIds) =>
          addShipmentToBrandOnDays(selectedBrand, units, days, skuIds)
        }
        isApproved={isApproved}
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
                  <th className="sticky-col name-col" colSpan={2}>Наименование</th>
                  {visibleMonthDays.map((day) => {
                    const h = dayInfo(day)
                    return (
                      <th
                        key={day}
                        className={`num day-col ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${h.isWeekEnd ? 'week-end' : ''}`}
                      >
                        {h.isToday && hasTodayInMonth && (
                          <button
                            type="button"
                            className={`table-today-tab ${hidePastInTable ? 'is-expand' : 'is-collapse'}`}
                            onClick={() => setHidePastInTable((v) => !v)}
                            title={
                              hidePastInTable
                                ? `Показать прошедшие дни (${monthDays.length - visibleMonthDays.length})`
                                : 'Свернуть прошедшие дни'
                            }
                            aria-label={
                              hidePastInTable
                                ? 'Показать прошедшие дни'
                                : 'Свернуть прошедшие дни'
                            }
                          >
                            {hidePastInTable ? '»' : '«'}
                          </button>
                        )}
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
                        {visibleMonthDays.map((day) => {
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
                            {visibleMonthDays.map((day) => {
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
                  {visibleMonthDays.map((day) => {
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
                icon: 'edit',
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
                icon: 'edit',
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

function BeerDetails({ beer, monthKey: initialMonthKey = currentMonthKey, onBack, onChange, isApproved = false, topbarProps }) {
  // Локальный переключатель месяцев внутри SKU — не влияет на выбор месяца в общей таблице.
  // При открытии подхватываем месяц из главной, дальше пользователь может листать
  // календарь этого SKU независимо.
  const [activeMonthKey, setActiveMonthKey] = useState(initialMonthKey)
  const availableMonths = useMemo(
    () =>
      [0, 1, 2, 3].map((delta) => {
        const key = shiftMonth(currentMonthKey, delta)
        return { key, label: getMonthLabel(key) }
      }),
    []
  )

  // Если сохранённого плана нет (или он состоит из одних нулей — legacy-состояние,
  // когда календарь при пустом overrides затирал salesByDay нулями через sync-effect) —
  // засеваем календарь из beer.salesByDay (то, что видно в таблице).
  const [overrides, setOverrides] = useState(() => {
    const saved = loadBeerPlan(beer.id)
    const savedOverrides = saved?.overrides || {}
    const savedSum = Object.values(savedOverrides).reduce((s, v) => s + (v || 0), 0)
    if (savedSum > 0) return savedOverrides
    return { ...beer.salesByDay }
  })
  const [totalUnits, setTotalUnits] = useState(() => {
    const saved = loadBeerPlan(beer.id)
    const savedOverrides = saved?.overrides || {}
    const savedSum = Object.values(savedOverrides).reduce((s, v) => s + (v || 0), 0)
    if (savedSum > 0 && typeof saved.totalUnits === 'number') return saved.totalUnits
    const md = getMonthDays(initialMonthKey)
    return md.reduce((s, d) => s + (beer.salesByDay[d] || 0), 0)
  })
  const [pinned] = useState(() => loadBeerPlan(beer.id)?.pinned || new Set())
  const [selection, setSelection] = useState(() => new Set())
  const [contextMenu, setContextMenu] = useState(null)
  const [inputPrompt, setInputPrompt] = useState(null)

  const monthDays = useMemo(() => getMonthDays(activeMonthKey), [activeMonthKey])
  const editableSet = useMemo(
    () => new Set(getEditableDays(activeMonthKey, EDITABLE_LEAD_DAYS)),
    [activeMonthKey]
  )
  const isDayEditable = (day) => editableSet.has(day)

  useEffect(() => {
    saveBeerPlan(beer.id, { shipmentDays: [], overrides, totalUnits, pinned })
  }, [beer.id, overrides, totalUnits, pinned])

  const distributedTotal = useMemo(
    () => monthDays.reduce((s, d) => s + (overrides[d] || 0), 0),
    [monthDays, overrides]
  )

  const shippedToDate = useMemo(
    () => monthDays.reduce((s, d) => (d < todayStr ? s + (overrides[d] || 0) : s), 0),
    [monthDays, overrides]
  )
  const leftToShip = Math.max(0, totalUnits - shippedToDate)
  const daysLeft = useMemo(
    () => monthDays.filter((d) => d >= todayStr).length,
    [monthDays]
  )
  const avgPerDayLeft = daysLeft > 0 ? Math.round(leftToShip / daysLeft) : 0

  const percents = useMemo(() => {
    const map = {}
    if (totalUnits > 0) {
      for (const [d, v] of Object.entries(overrides)) {
        map[d] = (v / totalUnits) * 100
      }
    }
    return map
  }, [overrides, totalUnits])

  // Страховочный пересев: если в overrides для ТЕКУЩЕГО МЕСЯЦА нет значений,
  // а beer.salesByDay содержит — заполняем overrides из salesByDay. Проверяем
  // именно по месяцу (не по всему overrides), чтобы переключение месяца тоже
  // подхватывало baseline из mockData. При смене месяца totalUnits всегда
  // пересчитываем — иначе показывали бы «план на месяц» от предыдущего.
  useEffect(() => {
    const monthOverridesSum = monthDays.reduce((s, d) => s + (overrides[d] || 0), 0)
    if (monthOverridesSum > 0) {
      setTotalUnits(monthOverridesSum)
      return
    }
    const salesSum = monthDays.reduce((s, d) => s + (beer.salesByDay[d] || 0), 0)
    if (salesSum === 0) {
      setTotalUnits(0)
      return
    }
    const seeded = { ...overrides }
    for (const d of monthDays) {
      const v = beer.salesByDay[d]
      if (v && v > 0) seeded[d] = v
    }
    setOverrides(seeded)
    setTotalUnits(salesSum)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beer.id, activeMonthKey])

  useEffect(() => {
    const next = { ...beer.salesByDay }
    let changed = false
    for (const day of monthDays) {
      // Игнорируем дни, где явного override нет — не затираем salesByDay нулями.
      // При реальной очистке дня overrides[day] удаляется через clearDayOverride,
      // и мы честно не трогаем App state (таблица оставит текущее значение до рефреша).
      if (!(day in overrides)) continue
      const v = overrides[day] || 0
      if ((next[day] || 0) !== v) {
        next[day] = v
        changed = true
      }
    }
    if (changed) onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrides, monthDays])

  const remainingDays = useMemo(
    () => monthDays.filter((d) => isDayEditable(d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthDays, editableSet]
  )

  // Раскладывает targetSum равномерно по daysArr, ЗАМЕЩАЯ их значения. Total не трогаем —
  // используется для «заполнить недобор» (гэп между totalUnits и distributedTotal распределяется
  // по выделенным пустым дням, доводя distributedTotal до totalUnits).
  function fillDaysEvenly(daysArr, targetSum) {
    const targets = daysArr.filter(isDayEditable)
    if (targets.length === 0) return
    const clean = Math.max(0, Math.round(targetSum))
    const per = Math.floor(clean / targets.length)
    const remainder = clean - per * targets.length
    setOverrides((prev) => {
      const next = { ...prev }
      targets.forEach((d, i) => {
        next[d] = per + (i === targets.length - 1 ? remainder : 0)
      })
      return next
    })
  }

  // Bulk-снятие значений с выделенных дней (только editable); total идёт за суммой.
  function clearDaysRolling(daysArr) {
    const targets = daysArr.filter(isDayEditable)
    if (targets.length === 0) return
    const totalRemoved = targets.reduce((s, d) => s + (overrides[d] || 0), 0)
    setOverrides((prev) => {
      const next = { ...prev }
      targets.forEach((d) => delete next[d])
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
    if (!isDayEditable(day)) return
    const prev = overrides[day] || 0
    setOverrides((prevMap) => {
      const next = { ...prevMap }
      delete next[day]
      return next
    })
    if (prev > 0) setTotalUnits((t) => Math.max(0, t - prev))
  }

  function setSameUnitsForDays(daysArr, units, mode = 'each') {
    const targets = daysArr.filter(isDayEditable)
    if (targets.length === 0) return
    const n = targets.length
    const clean = Math.max(0, Math.round(units))
    const isSplit = mode === 'split' && n > 1
    const base = isSplit ? Math.floor(clean / n) : clean
    const rem = isSplit ? clean - base * n : 0
    setOverrides((prev) => {
      const next = { ...prev }
      targets.forEach((d, i) => {
        next[d] = base + (isSplit && i < rem ? 1 : 0)
      })
      return next
    })
    const targetSet = new Set(targets)
    // Считаем только текущий месяц — overrides seed-ится из beer.salesByDay,
    // где лежат данные за ~13 месяцев. Раньше otherSum забирал всё подряд и
    // «Итоговый план» распухал на сумму соседних месяцев.
    const otherSum = monthDays
      .filter((d) => !targetSet.has(d))
      .reduce((s, d) => s + (overrides[d] || 0), 0)
    const applied = isSplit ? clean : clean * n
    setTotalUnits(otherSum + applied)
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
        icon: 'sparkles',
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
        icon: hasValue ? 'edit' : 'plus',
        label: hasValue ? 'Изменить' : 'Добавить',
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
          icon: 'eraser',
          danger: true,
          label: 'Очистить',
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
          icon: 'equals',
          label: anyHasValueMulti
            ? `Изменить (${n})`
            : `Добавить одинаково (${n})`,
          action: () => {
            setContextMenu(null)
            setInputPrompt({
              title: anyHasValueMulti
                ? `Изменить · ${formatDayRangeLabel(selArr)}`
                : `Добавить · ${formatDayRangeLabel(selArr)}`,
              defaultValue: Math.round(totalUnits / n),
              daysCount: n,
              onSubmit: (v, mode) => setSameUnitsForDays(selArr, v, mode)
            })
          }
        })
      }
      if (anyHasValueMulti) {
        items.push({
          icon: 'trash',
          danger: true,
          label: `Очистить (${n})`,
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
      const setSelPreset = (daysArr) => {
        setSelection(new Set(daysArr))
        setContextMenu(null)
      }
      items.push({
        icon: 'checkSquare',
        label: 'Выделить…',
        submenu: [
          { icon: 'check', label: 'Все', action: () => setSelPreset(monthDays) },
          { icon: 'check', label: 'Оставшиеся', action: () => setSelPreset(remainingDays) }
        ]
      })

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

        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">Итоговый план · {getMonthLabel(activeMonthKey)}</div>
            <div className="stat-value">
              {formatNumber(totalUnits)} <span className="stat-unit">гл</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Отгружено</div>
            <div className="stat-value">
              {formatNumber(shippedToDate)} <span className="stat-unit">гл</span>
              {totalUnits > 0 && (
                <span className="stat-sub">
                  {Math.round((shippedToDate / totalUnits) * 100)}%
                </span>
              )}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Осталось отгрузить</div>
            <div className="stat-value">
              {formatNumber(leftToShip)} <span className="stat-unit">гл</span>
              {totalUnits > 0 && (
                <span className="stat-sub">
                  {Math.round((leftToShip / totalUnits) * 100)}%
                </span>
              )}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">В среднем в день · осталось {daysLeft}&nbsp;дн.</div>
            <div className="stat-value">
              {formatNumber(avgPerDayLeft)} <span className="stat-unit">гл/день</span>
            </div>
          </div>
        </div>

        <div className="plan-layout">
          <PlanCalendar
            monthDays={monthDays}
            monthKey={activeMonthKey}
            selection={selection}
            onSelectionChange={setSelection}
            overrides={overrides}
            percents={percents}
            onCellContextMenu={openContextMenu}
            pinned={pinned}
            isApproved={isApproved}
            isDayEditable={isDayEditable}
            onPrompt={setInputPrompt}
            onEditDayRolling={editDayRolling}
            onSetSameUnits={setSameUnitsForDays}
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
            onSetSameUnits={setSameUnitsForDays}
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
            daysCount={inputPrompt.daysCount}
            onSubmit={(n, mode) => {
              inputPrompt.onSubmit(n, mode)
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

function formatDayRangeLabel(days) {
  if (!days || days.length === 0) return ''
  const sorted = [...days].sort()
  const first = new Date(sorted[0])
  const last = new Date(sorted[sorted.length - 1])
  const dayFmt = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric' })
  const dayMonthFmt = (d) =>
    d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  if (sorted.length === 1 || sorted[0] === sorted[sorted.length - 1]) {
    return dayMonthFmt(first)
  }
  if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
    return `${dayFmt(first)}–${dayMonthFmt(last)}`
  }
  return `${dayMonthFmt(first)} — ${dayMonthFmt(last)}`
}

function BrandDetails({
  brand,
  beers,
  monthKey: initialMonthKey = currentMonthKey,
  onBack,
  onAddShipmentOnDays,
  isApproved = false,
  topbarProps
}) {
  // Локальный переключатель месяцев внутри категории — не влияет на выбор месяца
  // в главной таблице.
  const [activeMonthKey, setActiveMonthKey] = useState(initialMonthKey)
  const availableMonths = useMemo(
    () =>
      [0, 1, 2, 3].map((delta) => {
        const key = shiftMonth(currentMonthKey, delta)
        return { key, label: getMonthLabel(key) }
      }),
    []
  )

  const monthDays = useMemo(() => getMonthDays(activeMonthKey), [activeMonthKey])
  const weeks = useMemo(() => buildCalendarWeeks(monthDays), [monthDays])
  const monthLabel = useMemo(() => getMonthLabel(activeMonthKey), [activeMonthKey])
  const editableSet = useMemo(
    () => new Set(getEditableDays(activeMonthKey, EDITABLE_LEAD_DAYS)),
    [activeMonthKey]
  )
  const isDayEditable = (day) => editableSet.has(day)

  const [selection, setSelection] = useState(() => new Set())
  const [categoryPrompt, setCategoryPrompt] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [focusView, setFocusView] = useState('grid') // 'grid' | 'list'

  // Сбрасываем выделение при переключении месяца — старые day-строки принадлежат
  // прошлому месяцу и не должны участвовать в bulk-операциях нового.
  useEffect(() => {
    setSelection(new Set())
  }, [activeMonthKey])

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

  const shippedToDate = useMemo(
    () =>
      monthDays
        .filter((d) => d < todayStr)
        .reduce((s, d) => s + (brandByDay[d] || 0), 0),
    [brandByDay, monthDays]
  )
  const leftToShip = Math.max(0, monthTotal - shippedToDate)
  const daysLeft = useMemo(
    () => monthDays.filter((d) => d >= todayStr).length,
    [monthDays]
  )
  const avgPerDayLeft = daysLeft > 0 ? Math.round(leftToShip / daysLeft) : 0

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

  function openAddShipmentOnSelection() {
    const n = editableSelected.length
    if (n === 0) return
    setCategoryPrompt({ days: [...editableSelected] })
  }

  function openContextMenu(e, day) {
    e.preventDefault()
    e.stopPropagation()
    if (!selection.has(day) && selection.size === 0) {
      setSelection(new Set([day]))
    }
    const menuWidth = 280
    const menuMaxHeight = 320
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8)
    const y = Math.min(e.clientY, window.innerHeight - menuMaxHeight - 8)
    setContextMenu({ x, y, day })
  }

  function buildMenuItems() {
    const selArrLocal = Array.from(selection).sort()
    const editableInSel = selArrLocal.filter((d) => d >= todayStr && isDayEditable(d))
    const n = editableInSel.length
    const items = []

    if (n >= 1) {
      const hasValue = editableInSel.some((d) => (brandByDay[d] || 0) > 0)
      const label = n === 1
        ? (hasValue ? 'Изменить' : 'Добавить')
        : (hasValue ? `Изменить (${n})` : `Добавить (${n})`)
      items.push({
        icon: hasValue ? 'edit' : 'plus',
        label,
        action: () => {
          setContextMenu(null)
          openAddShipmentOnSelection()
        }
      })
    }

    items.push({ divider: true })
    const setSelPreset = (daysArr) => {
      setSelection(new Set(daysArr))
      setContextMenu(null)
    }
    items.push({
      icon: 'checkSquare',
      label: 'Выделить…',
      submenu: [
        { icon: 'check', label: 'Все', action: () => setSelPreset(monthDays) },
        {
          icon: 'check',
          label: 'Оставшиеся',
          action: () =>
            setSelPreset(monthDays.filter((d) => d >= todayStr && isDayEditable(d)))
        }
      ]
    })

    return items
  }

  // Marquee-выделение — копия механики из PlanCalendar.
  const calendarBodyRef = useRef(null)
  const marqueeStartRef = useRef(null)
  const baseSelectionRef = useRef(new Set())
  const additiveRef = useRef(false)
  const draggedRef = useRef(false)
  const lastClickRef = useRef({ time: 0, day: null })
  const rangeAnchorRef = useRef(null)
  const openAddRef = useRef(null)
  const [marquee, setMarquee] = useState(null)

  useEffect(() => {
    rangeAnchorRef.current = null
  }, [activeMonthKey])

  const DRAG_THRESHOLD = 4
  const DBLCLICK_MS = 400

  openAddRef.current = (day) => {
    if (!isDayEditable(day)) return
    // Двойной клик по ячейке из мульти-выделения — открываем bulk-диалог на всё выделение,
    // не сворачивая selection к одному дню.
    if (selection.size > 1 && selection.has(day)) {
      openAddShipmentOnSelection()
      return
    }
    setSelection(new Set([day]))
    setCategoryPrompt({ days: [day] })
  }

  useEffect(() => {
    const el = calendarBodyRef.current
    if (!el) return
    function onNativeClick(e) {
      const cellEl = e.target.closest?.('.ship-cell[data-day]')
      if (!cellEl || !el.contains(cellEl)) return
      const day = cellEl.dataset.day
      if (!day) return
      const now = Date.now()
      const last = lastClickRef.current
      if (last.day === day && now - last.time < DBLCLICK_MS) {
        lastClickRef.current = { time: 0, day: null }
        openAddRef.current?.(day)
      } else {
        lastClickRef.current = { time: now, day }
      }
    }
    el.addEventListener('click', onNativeClick)
    return () => el.removeEventListener('click', onNativeClick)
  }, [])

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
        if (start.rangeMode && rangeAnchorRef.current) {
          const anchor = rangeAnchorRef.current
          const i1 = monthDays.indexOf(anchor)
          const i2 = monthDays.indexOf(day)
          if (i1 !== -1 && i2 !== -1) {
            const [lo, hi] = i1 <= i2 ? [i1, i2] : [i2, i1]
            setSelection(new Set(monthDays.slice(lo, hi + 1)))
          } else {
            setSelection(new Set([day]))
            rangeAnchorRef.current = day
          }
        } else if (start.toggleMode) {
          const next = new Set(baseSelectionRef.current)
          if (next.has(day)) next.delete(day)
          else next.add(day)
          setSelection(next)
        } else if (baseSelectionRef.current.size > 1 && baseSelectionRef.current.has(day)) {
          // Клик по ячейке внутри мульти-выделения — сохраняем выделение,
          // чтобы двойной клик мог открыть bulk-диалог на весь диапазон.
        } else {
          setSelection(new Set([day]))
          rangeAnchorRef.current = day
        }
      } else if (!start.toggleMode && !start.rangeMode) {
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
    const rangeMode = e.shiftKey || e.altKey
    const toggleMode = !rangeMode && (e.metaKey || e.ctrlKey)
    marqueeStartRef.current = {
      startX: x,
      startY: y,
      cellDay,
      rangeMode,
      toggleMode
    }
    additiveRef.current = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey
    baseSelectionRef.current = new Set(selection)
    draggedRef.current = false
    if (!cellEl) e.preventDefault()
  }

  function selectWeek(days) {
    setSelection(new Set(days))
    rangeAnchorRef.current = days[0] || null
  }

  function selectAllPreset() {
    setSelection(new Set(monthDays))
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
              <span className="brand-crumb-sku-count">
                {beers.length} SKU
              </span>
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

        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">Итоговый план · {monthLabel}</div>
            <div className="stat-value">
              {formatNumber(monthTotal)} <span className="stat-unit">гл</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Отгружено</div>
            <div className="stat-value">
              {formatNumber(shippedToDate)} <span className="stat-unit">гл</span>
              {monthTotal > 0 && (
                <span className="stat-sub">
                  {Math.round((shippedToDate / monthTotal) * 100)}%
                </span>
              )}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Осталось отгрузить</div>
            <div className="stat-value">
              {formatNumber(leftToShip)} <span className="stat-unit">гл</span>
              {monthTotal > 0 && (
                <span className="stat-sub">
                  {Math.round((leftToShip / monthTotal) * 100)}%
                </span>
              )}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">В среднем в день · осталось {daysLeft}&nbsp;дн.</div>
            <div className="stat-value">
              {formatNumber(avgPerDayLeft)} <span className="stat-unit">гл/день</span>
            </div>
          </div>
        </div>

        <div className="plan-layout">
          <div className="ship-panel">
            <div className="ship-toolbar">
              <span className="ship-month">{monthLabel}</span>
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
                          onContextMenu={(e) => openContextMenu(e, day)}
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
              <div className="focus-cards-block">
                <div className="focus-cards-toolbar">
                  <span className="focus-cards-title">
                    Выделено дней: <strong>{selArr.length}</strong>
                  </span>
                  <div
                    className="focus-view-toggle"
                    role="tablist"
                    aria-label="Режим отображения"
                  >
                    <button
                      role="tab"
                      aria-selected={focusView === 'grid'}
                      className={`focus-view-tab ${focusView === 'grid' ? 'is-active' : ''}`}
                      onClick={() => setFocusView('grid')}
                      title="По несколько дней в ряд"
                    >
                      Плитка
                    </button>
                    <button
                      role="tab"
                      aria-selected={focusView === 'list'}
                      className={`focus-view-tab ${focusView === 'list' ? 'is-active' : ''}`}
                      onClick={() => setFocusView('list')}
                      title="Каждый день с новой строки"
                    >
                      Список
                    </button>
                  </div>
                </div>
                <div className={`focus-cards-row is-${focusView}`}>
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
                  const dateObj = new Date(day)
                  const dayNum = dateObj.getDate()
                  const dow = dateObj.toLocaleDateString('ru-RU', { weekday: 'short' })
                  const monthShort = dateObj.toLocaleDateString('ru-RU', { month: 'short' })
                  return (
                    <div
                      key={day}
                      className={`focus-card ${dayIsLocked ? 'is-locked' : ''}`}
                    >
                      <div className="focus-card-head">
                        <div className="focus-card-date">
                          <span className="focus-card-date-num">{dayNum}</span>
                          <span className="focus-card-date-meta">
                            <span className="focus-card-date-dow">{dow}</span>
                            <span className="focus-card-date-month">{monthShort}</span>
                          </span>
                          {dayIsLocked && (
                            <span
                              className="focus-card-badge"
                              title="День заблокирован для новых отгрузок"
                              aria-label="заблокирован"
                            >
                              <LockIcon />
                            </span>
                          )}
                        </div>
                        <div className="focus-card-units">
                          <span className="focus-card-units-num">{formatNumber(units)}</span>
                          <span className="focus-card-units-suffix">гл</span>
                        </div>
                      </div>
                      <div className="focus-card-sku-list">
                        {daySkus.length === 0 ? (
                          <div className="focus-card-empty">— нет продаж —</div>
                        ) : (
                          daySkus.map((s) => {
                            const share = units > 0 ? (s.val / units) * 100 : 0
                            return (
                              <div
                                key={s.id}
                                className="focus-card-sku-row"
                                title={s.name}
                              >
                                <span className="focus-card-sku-name">{s.name}</span>
                                <span className="focus-card-sku-val">
                                  {formatNumber(s.val)}
                                </span>
                                <span className="focus-card-sku-share">
                                  {Math.round(share)}%
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
              </div>
            )}
          </div>

          <aside className="plan-rail">
            <div className="rail-section">
              <div className="rail-section-head">
                <span>Выделение</span>
                {nSel > 0 && (
                  <button
                    className="rail-clear-link"
                    onClick={() => setSelection(new Set())}
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
                      {selSum > 0 ? 'Изменить' : 'Добавить'}
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
                          ? `${nSel - editableSelected.length} из ${nSel} — заблокированы, применится только к ${editableSelected.length}`
                          : ''
                      }
                    >
                      {selSum > 0 ? 'Изменить' : 'Добавить'}
                      {editableSelected.length === nSel
                        ? ` (${nSel})`
                        : ` (${editableSelected.length} из ${nSel})`}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="rail-section">
              <div className="rail-section-head">
                <span>Быстрое выделение</span>
              </div>
              <div className="rail-presets">
                <button
                  className="rail-preset-chip"
                  onClick={selectAllPreset}
                  title="Выделить все дни месяца"
                >
                  Все <span className="rail-preset-chip-count">{monthDays.length}</span>
                </button>
                <button
                  className="rail-preset-chip"
                  onClick={selectRemaining}
                  disabled={targetDaysCount === 0}
                  title="Выделить только дни, куда ещё можно внести отгрузку"
                >
                  Оставшиеся <span className="rail-preset-chip-count">{targetDaysCount}</span>
                </button>
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
                      <td className="rail-week-label">Н{row.i + 1}</td>
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
              Shift или ⌥ + клик — диапазон · ⌘/Ctrl + клик — добавить или убрать одну ячейку · зажми и веди — прямоугольник
            </p>

          </aside>
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

        {categoryPrompt && (
          <CategoryShipmentPrompt
            days={categoryPrompt.days}
            beers={beers}
            onSubmit={(totalUnits, skuIds) => {
              if (totalUnits !== 0) {
                onAddShipmentOnDays(categoryPrompt.days, totalUnits, skuIds)
              }
              setCategoryPrompt(null)
            }}
            onCancel={() => setCategoryPrompt(null)}
          />
        )}
      </div>
    </>
  )
}


function DeltaSparkline({ trajectory, width = 76, height = 26, title }) {
  if (!trajectory || trajectory.length === 0) {
    return <span className="var-spark-empty" title={title}>—</span>
  }
  const points = trajectory.map((p) => p.cumDelta)
  const n = points.length
  const maxAbs = Math.max(1, ...points.map((v) => Math.abs(v)))
  const padY = 3
  const midY = height / 2
  const scaleY = (height / 2 - padY) / maxAbs
  const stepX = n > 1 ? width / (n - 1) : 0
  const coords = points.map((v, i) => [
    n === 1 ? width / 2 : i * stepX,
    midY - v * scaleY
  ])
  const path = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const lastX = coords[n - 1][0]
  const firstX = coords[0][0]
  const areaPath = `${path} L${lastX.toFixed(1)},${midY} L${firstX.toFixed(1)},${midY} Z`
  const end = points[n - 1]
  const color = end < 0 ? '#dc2626' : end > 0 ? '#059669' : '#94a3b8'
  const fill = end < 0
    ? 'rgba(220,38,38,0.14)'
    : end > 0
      ? 'rgba(5,150,105,0.14)'
      : 'rgba(148,163,184,0.10)'
  return (
    <svg
      className="var-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <title>{title || 'Накопленная Δ по дням'}</title>
      <line
        x1="0"
        y1={midY}
        x2={width}
        y2={midY}
        stroke="#cbd5e1"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <path d={areaPath} fill={fill} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={coords[n - 1][0]}
        cy={coords[n - 1][1]}
        r="1.9"
        fill={color}
      />
    </svg>
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
        const trajectory = []
        for (const day of reportedDays) {
          planReported += beer.salesByDay[day] || 0
          actualReported += beer.actualByDay?.[day] ?? 0
          trajectory.push({ day, cumDelta: actualReported - planReported })
        }
        const planMonth = monthDays.reduce((s, d) => s + (beer.salesByDay[d] || 0), 0)
        const deltaCum = actualReported - planReported
        const projectedPct =
          planReported > 0 ? (actualReported / planReported) * 100 : null
        const projectedMonth =
          planReported > 0
            ? Math.round((actualReported / planReported) * planMonth)
            : null
        return {
          ...beer,
          planMonth,
          planReported,
          actualReported,
          deltaCum,
          projectedPct,
          projectedMonth,
          trajectory
        }
      }),
    [beers, reportedDays, monthDays]
  )

  const brandRows = useMemo(
    () =>
      brandGroups.map((group) => {
        const skus = skuRows.filter((s) => s.brand === group.brand)
        const planMonth = skus.reduce((s, x) => s + x.planMonth, 0)

        const planByDay = {}
        const actualByDay = {}
        for (const day of monthDays) {
          planByDay[day] = skus.reduce((s, x) => s + (x.salesByDay[day] || 0), 0)
          actualByDay[day] = skus.reduce(
            (s, x) => s + (x.actualByDay?.[day] ?? 0),
            0
          )
        }

        let planReported = 0
        let actualReported = 0
        const trajectory = []
        for (const day of reportedDays) {
          planReported += planByDay[day] || 0
          actualReported += actualByDay[day] || 0
          trajectory.push({ day, cumDelta: actualReported - planReported })
        }
        const deltaCum = actualReported - planReported
        const projectedPct =
          planReported > 0 ? (actualReported / planReported) * 100 : null
        const projectedMonth =
          planReported > 0
            ? Math.round((actualReported / planReported) * planMonth)
            : null
        return {
          brand: group.brand,
          skus,
          planMonth,
          planReported,
          actualReported,
          deltaCum,
          projectedPct,
          projectedMonth,
          trajectory,
          planByDay,
          actualByDay
        }
      }),
    [brandGroups, skuRows, monthDays, reportedDays]
  )

  const grandRow = useMemo(() => {
    const planByDay = {}
    const actualByDay = {}
    for (const day of monthDays) {
      planByDay[day] = brandRows.reduce((s, x) => s + (x.planByDay[day] || 0), 0)
      actualByDay[day] = brandRows.reduce((s, x) => s + (x.actualByDay[day] || 0), 0)
    }
    const planMonth = brandRows.reduce((s, x) => s + x.planMonth, 0)
    let planReported = 0
    let actualReported = 0
    const trajectory = []
    for (const day of reportedDays) {
      planReported += planByDay[day] || 0
      actualReported += actualByDay[day] || 0
      trajectory.push({ day, cumDelta: actualReported - planReported })
    }
    const deltaCum = actualReported - planReported
    const projectedPct =
      planReported > 0 ? (actualReported / planReported) * 100 : null
    const projectedMonth =
      planReported > 0
        ? Math.round((actualReported / planReported) * planMonth)
        : null
    return {
      planByDay,
      actualByDay,
      planMonth,
      planReported,
      actualReported,
      deltaCum,
      projectedPct,
      projectedMonth,
      trajectory
    }
  }, [brandRows, monthDays, reportedDays])

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
                <th className="num plan-fact-col" title={`Абсолютные значения: факт (по ${actualCutoffLabel}) из плана на этот же период`}>
                  Факт · План
                </th>
                <th className="num spark-col" title="Тренд накопленной Δ по дням месяца">
                  Тренд Δ
                </th>
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
                      <td className="num plan-fact-col brand-day">
                        <div className="cell-stack">
                          <span>
                            <strong>{formatNumber(group.actualReported)}</strong>
                            <span className="cell-slash"> / </span>
                            {formatNumber(group.planReported)}
                          </span>
                          <span className="cell-sub">
                            план мес. {formatNumber(group.planMonth)}
                          </span>
                        </div>
                      </td>
                      <td className="num spark-col brand-day">
                        <DeltaSparkline
                          trajectory={group.trajectory}
                          title={`Тренд Δ · ${group.brand}`}
                        />
                      </td>
                      <td className={`num remaining-col brand-day ${groupDeltaCls}`}>
                        <div className="cell-stack">
                          <span>{groupDeltaSign}{formatNumber(group.deltaCum)}</span>
                          <span className="cell-sub">
                            {group.planReported > 0
                              ? `${groupDeltaSign}${((group.deltaCum / group.planReported) * 100).toFixed(1)}%`
                              : '—'}
                          </span>
                        </div>
                      </td>
                      <td className={`num total-col brand-day ${projCls}`}>
                        <div className="cell-stack">
                          <span>
                            {group.projectedPct == null ? '—' : `${group.projectedPct.toFixed(0)}%`}
                          </span>
                          <span className="cell-sub">
                            {group.projectedMonth == null
                              ? '—'
                              : `≈ ${formatNumber(group.projectedMonth)} гл`}
                          </span>
                        </div>
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
                            <td className="num plan-fact-col">
                              <div className="cell-stack">
                                <span>
                                  <strong>{formatNumber(beer.actualReported)}</strong>
                                  <span className="cell-slash"> / </span>
                                  {formatNumber(beer.planReported)}
                                </span>
                                <span className="cell-sub">
                                  план мес. {formatNumber(beer.planMonth)}
                                </span>
                              </div>
                            </td>
                            <td className="num spark-col">
                              <DeltaSparkline
                                trajectory={beer.trajectory}
                                title={`Тренд Δ · ${beer.name}`}
                              />
                            </td>
                            <td className={`num remaining-col ${skuDeltaCls}`}>
                              <div className="cell-stack">
                                <span>{skuDeltaSign}{formatNumber(beer.deltaCum)}</span>
                                <span className="cell-sub">
                                  {beer.planReported > 0
                                    ? `${skuDeltaSign}${((beer.deltaCum / beer.planReported) * 100).toFixed(1)}%`
                                    : '—'}
                                </span>
                              </div>
                            </td>
                            <td className={`num total-col strong ${skuProjCls}`}>
                              <div className="cell-stack">
                                <span>
                                  {beer.projectedPct == null ? '—' : `${beer.projectedPct.toFixed(0)}%`}
                                </span>
                                <span className="cell-sub">
                                  {beer.projectedMonth == null
                                    ? '—'
                                    : `≈ ${formatNumber(beer.projectedMonth)} гл`}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </Fragment>
                )
              })}
              {(() => {
                const gDeltaSign = grandRow.deltaCum > 0 ? '+' : ''
                const gDeltaCls =
                  grandRow.deltaCum < 0
                    ? 'var-red'
                    : grandRow.deltaCum > 0
                      ? 'var-green'
                      : ''
                const gProjCls =
                  grandRow.projectedPct == null
                    ? ''
                    : grandRow.projectedPct < 95
                      ? 'var-red'
                      : grandRow.projectedPct > 105
                        ? 'var-green'
                        : ''
                return (
                  <tr className="total-row variance-total-row">
                    <td className="sticky-col name-col strong">Итого</td>
                    {monthDays.map((day) => {
                      const h = dayInfo(day)
                      const c = renderCellContent(
                        grandRow.planByDay[day] || 0,
                        grandRow.actualByDay[day] || 0,
                        day
                      )
                      return (
                        <td
                          key={day}
                          className={`num day-col strong ${h.isWeekend ? 'weekend' : ''} ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${c.cls}`}
                          title={c.title}
                        >
                          {c.node}
                        </td>
                      )
                    })}
                    <td className="num plan-fact-col strong">
                      <div className="cell-stack">
                        <span>
                          <strong>{formatNumber(grandRow.actualReported)}</strong>
                          <span className="cell-slash"> / </span>
                          {formatNumber(grandRow.planReported)}
                        </span>
                        <span className="cell-sub">
                          план мес. {formatNumber(grandRow.planMonth)}
                        </span>
                      </div>
                    </td>
                    <td className="num spark-col strong">
                      <DeltaSparkline
                        trajectory={grandRow.trajectory}
                        title="Тренд Δ · Итого"
                      />
                    </td>
                    <td className={`num remaining-col strong ${gDeltaCls}`}>
                      <div className="cell-stack">
                        <span>{gDeltaSign}{formatNumber(grandRow.deltaCum)}</span>
                        <span className="cell-sub">
                          {grandRow.planReported > 0
                            ? `${gDeltaSign}${((grandRow.deltaCum / grandRow.planReported) * 100).toFixed(1)}%`
                            : '—'}
                        </span>
                      </div>
                    </td>
                    <td className={`num total-col strong ${gProjCls}`}>
                      <div className="cell-stack">
                        <span>
                          {grandRow.projectedPct == null ? '—' : `${grandRow.projectedPct.toFixed(0)}%`}
                        </span>
                        <span className="cell-sub">
                          {grandRow.projectedMonth == null
                            ? '—'
                            : `≈ ${formatNumber(grandRow.projectedMonth)} гл`}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <p className="hint">
        Метрика в ячейке — по переключателю сверху. Цвет: красный — недо-, зелёный — переотгрузка
        (порог ±5%, «сильный» — ±15%). Заштрихованный — ждём факт (лаг {ACTUAL_LAG_DAYS} дн.,
        последняя дата — <strong>{actualCutoffLabel}</strong>).
        Спарклайн «Тренд Δ» показывает, как накопленная дельта менялась день за днём —
        снижение вниз значит нарастающее отставание, вверх — восстановление.
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
  onSetSameUnits,
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

  const remainingDays = useMemo(
    () => monthDays.filter((d) => isDayEditable(d)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthDays, isDayEditable]
  )

  function selectWeek(days) {
    onSelectionChange(new Set(days))
  }

  function selectAllPreset() {
    onSelectionChange(new Set(monthDays))
  }

  function selectRemainingPreset() {
    onSelectionChange(new Set(remainingDays))
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
        ? `Изменить · ${formatDayRangeLabel(selArr)}`
        : `Добавить · ${formatDayRangeLabel(selArr)}`,
      defaultValue: nSel > 0 ? Math.round(totalUnits / nSel) : 0,
      daysCount: nSel,
      onSubmit: (v, mode) => onSetSameUnits(selArr, v, mode)
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
                {singleHasValue ? 'Изменить' : 'Добавить'}
              </button>
              {singleHasValue && (
                <button
                  className="rail-action rail-action-danger"
                  onClick={actionClearShipments}
                >
                  Очистить
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="rail-selection-stats">
              <div className="rail-stat-main">
                <span className="rail-stat-val">{nSel}</span>
                <span className="rail-stat-label">
                  {nSel < 5 ? 'дня' : 'дней'}
                  {anySelHasValue && (
                    <>
                      {' · '}
                      {formatNumber(selSum)} гл · {Math.round(selPct)}%
                    </>
                  )}
                </span>
              </div>
              <div className="rail-stat-side">
                <span className="rail-stat-side-sub">будни {selWorkdays}</span>
                <span className="rail-stat-side-sub">вых. {selWeekends}</span>
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
                {anySelHasValue ? 'Изменить' : 'Добавить'}
              </button>
              {anySelHasValue && (
                <button
                  className="rail-action rail-action-danger"
                  onClick={actionClearShipments}
                >
                  Очистить
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rail-section">
        <div className="rail-section-head">
          <span>Быстрое выделение</span>
        </div>
        <div className="rail-presets">
          <button
            className="rail-preset-chip"
            onClick={selectAllPreset}
            title="Выделить все дни месяца"
          >
            Все <span className="rail-preset-chip-count">{monthDays.length}</span>
          </button>
          <button
            className="rail-preset-chip"
            onClick={selectRemainingPreset}
            disabled={remainingDays.length === 0}
            title="Выделить только дни, куда ещё можно внести отгрузку"
          >
            Оставшиеся <span className="rail-preset-chip-count">{remainingDays.length}</span>
          </button>
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
                <td className="rail-week-label">Н{row.i + 1}</td>
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
        Shift или ⌥ + клик — диапазон · ⌘/Ctrl + клик — добавить или убрать одну ячейку · зажми и веди — прямоугольник · правый клик — меню действий
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
  onCellContextMenu,
  pinned,
  isApproved = false,
  isDayEditable = () => true,
  onPrompt,
  onEditDayRolling,
  onSetSameUnits
}) {
  const weeks = useMemo(() => buildCalendarWeeks(monthDays), [monthDays])
  const monthLabel = useMemo(() => getMonthLabel(monthKey), [monthKey])

  const panelRef = useRef(null)
  const marqueeStartRef = useRef(null)
  const baseSelectionRef = useRef(new Set())
  const additiveRef = useRef(false)
  const draggedRef = useRef(false)
  const lastClickRef = useRef({ time: 0, day: null })
  const rangeAnchorRef = useRef(null)
  const openEditRef = useRef(null)
  const [marquee, setMarquee] = useState(null)

  useEffect(() => {
    rangeAnchorRef.current = null
  }, [monthKey])

  const DRAG_THRESHOLD = 4
  const DBLCLICK_MS = 400

  openEditRef.current = (day) => {
    if (!isDayEditable(day)) return
    // Двойной клик по ячейке из мульти-выделения — правим все выделенные дни разом.
    if (selection.size > 1 && selection.has(day) && !isApproved && onSetSameUnits) {
      const selArr = Array.from(selection).sort().filter((d) => isDayEditable(d))
      if (selArr.length === 0) return
      const anyHasValue = selArr.some((d) => (overrides[d] || 0) > 0)
      const defaultValue = anyHasValue
        ? Math.round(
            selArr.reduce((s, d) => s + (overrides[d] || 0), 0) / selArr.length
          )
        : 0
      onPrompt({
        title: anyHasValue
          ? `Изменить · ${formatDayRangeLabel(selArr)}`
          : `Добавить · ${formatDayRangeLabel(selArr)}`,
        defaultValue,
        daysCount: selArr.length,
        onSubmit: (v, mode) => onSetSameUnits(selArr, v, mode)
      })
      return
    }
    const prev = overrides[day] || 0
    onSelectionChange(new Set([day]))
    onPrompt({
      title: formatDayLabel(day),
      defaultValue: prev,
      onSubmit: (v) => {
        onEditDayRolling(day, v)
        onSelectionChange(new Set())
      }
    })
  }

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    function onNativeClick(e) {
      const cellEl = e.target.closest?.('.ship-cell[data-day]')
      if (!cellEl || !el.contains(cellEl)) return
      const day = cellEl.dataset.day
      if (!day) return
      const now = Date.now()
      const last = lastClickRef.current
      if (last.day === day && now - last.time < DBLCLICK_MS) {
        lastClickRef.current = { time: 0, day: null }
        openEditRef.current?.(day)
      } else {
        lastClickRef.current = { time: now, day }
      }
    }
    el.addEventListener('click', onNativeClick)
    return () => el.removeEventListener('click', onNativeClick)
  }, [])

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
        if (start.rangeMode && rangeAnchorRef.current) {
          const anchor = rangeAnchorRef.current
          const i1 = monthDays.indexOf(anchor)
          const i2 = monthDays.indexOf(day)
          if (i1 !== -1 && i2 !== -1) {
            const [lo, hi] = i1 <= i2 ? [i1, i2] : [i2, i1]
            onSelectionChange(new Set(monthDays.slice(lo, hi + 1)))
          } else {
            onSelectionChange(new Set([day]))
            rangeAnchorRef.current = day
          }
        } else if (start.toggleMode) {
          const next = new Set(baseSelectionRef.current)
          if (next.has(day)) next.delete(day)
          else next.add(day)
          onSelectionChange(next)
        } else if (baseSelectionRef.current.size > 1 && baseSelectionRef.current.has(day)) {
          // Клик по ячейке внутри мульти-выделения — сохраняем выделение,
          // чтобы двойной клик мог открыть bulk-диалог на весь диапазон.
        } else {
          onSelectionChange(new Set([day]))
          rangeAnchorRef.current = day
        }
      } else if (!start.toggleMode && !start.rangeMode) {
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
    const rangeMode = e.shiftKey || e.altKey
    const toggleMode = !rangeMode && (e.metaKey || e.ctrlKey)
    marqueeStartRef.current = {
      startX: x,
      startY: y,
      cellDay,
      rangeMode,
      toggleMode
    }
    additiveRef.current = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey
    baseSelectionRef.current = new Set(selection)
    draggedRef.current = false
    if (!cellEl) e.preventDefault()
  }

  return (
    <div
      className="ship-panel has-marquee"
      ref={panelRef}
      onMouseDown={onPanelMouseDown}
    >
      <div className="ship-toolbar">
        <span className="ship-month">{monthLabel}</span>
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
                <span className="context-menu-item-icon" aria-hidden="true">
                  {item.icon ? <MenuIcon name={item.icon} /> : null}
                </span>
                <span className="context-menu-item-label">{item.label}</span>
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
                      <span className="context-menu-item-icon" aria-hidden="true">
                        {sub.icon ? <MenuIcon name={sub.icon} /> : null}
                      </span>
                      <span className="context-menu-item-label">{sub.label}</span>
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
            <span className="context-menu-item-icon" aria-hidden="true">
              {item.icon ? <MenuIcon name={item.icon} /> : null}
            </span>
            <span className="context-menu-item-label">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function InputPrompt({ title, hint, defaultValue, onSubmit, onCancel, max, daysCount }) {
  const [value, setValue] = useState(Number(defaultValue) > 0 ? String(defaultValue) : '')
  const [mode, setMode] = useState('each')
  const inputRef = useRef(null)
  useEffect(() => {
    inputRef.current?.select()
  }, [])
  const parsed = Math.max(0, parseInt(value, 10) || 0)
  const hasMax = typeof max === 'number' && Number.isFinite(max)
  const overMax = hasMax && parsed > max
  const canSubmit = !overMax
  const showModes = typeof daysCount === 'number' && daysCount > 1

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

  function switchMode(nextMode) {
    if (nextMode === mode || !showModes) return
    if (parsed > 0 && daysCount > 1) {
      if (nextMode === 'split' && mode === 'each') {
        setValue(String(parsed * daysCount))
      } else if (nextMode === 'each' && mode === 'split') {
        setValue(String(Math.round(parsed / daysCount)))
      }
    }
    setMode(nextMode)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function submit() {
    if (!canSubmit) return
    onSubmit(parsed, mode)
  }

  const [eyebrow, heading] = useMemo(() => {
    if (typeof title === 'string' && title.includes(' · ')) {
      const idx = title.indexOf(' · ')
      return [title.slice(0, idx), title.slice(idx + 3)]
    }
    return [null, title]
  }, [title])

  const perDay = mode === 'split' && daysCount > 1 ? Math.floor(parsed / daysCount) : parsed
  const total = mode === 'split' && daysCount > 1 ? parsed : parsed * (daysCount || 1)
  const remainder = mode === 'split' && daysCount > 1 ? parsed - perDay * daysCount : 0

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className={`dialog dialog-plan ${showModes ? 'has-modes' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          {eyebrow && <div className="dialog-eyebrow">{eyebrow}</div>}
          <div className="dialog-heading">
            {heading}
            {showModes && (
              <span className="dialog-days-chip">{daysCount}&nbsp;дн.</span>
            )}
          </div>
        </div>
        {hint && <div className="dialog-hint">{hint}</div>}
        {showModes && (
          <div className="dialog-modes" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'each'}
              className={`dialog-mode ${mode === 'each' ? 'is-active' : ''}`}
              onClick={() => switchMode('each')}
            >
              <span className="dialog-mode-label">В каждый день</span>
              <span className="dialog-mode-hint">одинаковое число</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'split'}
              className={`dialog-mode ${mode === 'split' ? 'is-active' : ''}`}
              onClick={() => switchMode('split')}
            >
              <span className="dialog-mode-label">Разделить поровну</span>
              <span className="dialog-mode-hint">на все дни</span>
            </button>
          </div>
        )}
        {hasMax && (
          <div className={`dialog-hint dialog-hint-accent ${overMax ? 'is-error' : ''}`}>
            Максимум: {formatNumber(max)} гл
          </div>
        )}
        <div className="dialog-input-wrap">
          <input
            ref={inputRef}
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
          <span className="dialog-input-suffix">
            гл{showModes ? (mode === 'split' ? ' всего' : ' / день') : ''}
          </span>
        </div>
        {showModes && (
          <div className="dialog-preview">
            {parsed > 0 ? (
              <>
                <div className="dialog-preview-row">
                  <span className="dialog-preview-label">В день</span>
                  <span className="dialog-preview-value">
                    {formatNumber(perDay)}<span className="dialog-preview-unit">гл</span>
                    {remainder > 0 && (
                      <span className="dialog-preview-badge">+1 · {remainder} дн.</span>
                    )}
                  </span>
                </div>
                <div className="dialog-preview-divider" />
                <div className="dialog-preview-row">
                  <span className="dialog-preview-label">Всего</span>
                  <span className="dialog-preview-value">
                    {formatNumber(total)}<span className="dialog-preview-unit">гл</span>
                  </span>
                </div>
              </>
            ) : (
              <div className="dialog-preview-empty">Введи число, чтобы увидеть раскладку</div>
            )}
          </div>
        )}
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

function CategoryShipmentPrompt({ days, beers, onSubmit, onCancel }) {
  const n = days.length
  const multi = n > 1
  const [value, setValue] = useState('')
  const [mode, setMode] = useState('each')
  const [selectedSkuIds, setSelectedSkuIds] = useState(
    () => new Set(beers.map((b) => b.id))
  )
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const parsed = (() => {
    if (value === '' || value === '-') return 0
    const n = parseInt(value, 10)
    return Number.isFinite(n) ? n : 0
  })()
  const totalDelta = multi ? (mode === 'each' ? parsed * n : parsed) : parsed
  const nSel = selectedSkuIds.size

  const skuRows = useMemo(() => {
    return beers.map((b) => {
      const weight = days.reduce((s, d) => s + (b.salesByDay[d] || 0), 0)
      return { id: b.id, name: b.name, weight }
    })
  }, [beers, days])

  const totalWeightInSel = skuRows
    .filter((r) => selectedSkuIds.has(r.id))
    .reduce((s, r) => s + r.weight, 0)

  const perDay = multi
    ? mode === 'each'
      ? parsed
      : n > 0
        ? Math.trunc(totalDelta / n)
        : 0
    : totalDelta

  const canSubmit = totalDelta !== 0 && nSel > 0

  function switchMode(nextMode) {
    if (!multi || nextMode === mode) return
    if (parsed !== 0) {
      if (nextMode === 'split' && mode === 'each') {
        setValue(String(parsed * n))
      } else if (nextMode === 'each' && mode === 'split') {
        setValue(String(Math.trunc(parsed / n)))
      }
    }
    setMode(nextMode)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function toggleSku(id) {
    const next = new Set(selectedSkuIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedSkuIds(next)
  }

  function selectAllSkus() {
    setSelectedSkuIds(new Set(beers.map((b) => b.id)))
  }
  function selectNoneSkus() {
    setSelectedSkuIds(new Set())
  }

  function submit() {
    if (!canSubmit) return
    onSubmit(totalDelta, Array.from(selectedSkuIds), mode)
  }

  const heading = multi ? formatDayRangeLabel(days) : formatDayLabel(days[0])
  const suffix = 'гл' + (multi ? (mode === 'split' ? ' всего' : ' / день') : '')

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div
        className={`dialog dialog-plan dialog-category ${multi ? 'has-modes' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <div className="dialog-eyebrow">Отгрузка на категорию</div>
          <div className="dialog-heading">
            {heading}
            {multi && <span className="dialog-days-chip">{n}&nbsp;дн.</span>}
          </div>
        </div>

        {multi && (
          <div className="dialog-modes" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'each'}
              className={`dialog-mode ${mode === 'each' ? 'is-active' : ''}`}
              onClick={() => switchMode('each')}
            >
              <span className="dialog-mode-label">В каждый день</span>
              <span className="dialog-mode-hint">одинаковое число</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'split'}
              className={`dialog-mode ${mode === 'split' ? 'is-active' : ''}`}
              onClick={() => switchMode('split')}
            >
              <span className="dialog-mode-label">Разделить поровну</span>
              <span className="dialog-mode-hint">на все дни</span>
            </button>
          </div>
        )}

        <div className="dialog-input-wrap">
          <input
            ref={inputRef}
            className="dialog-input"
            type="number"
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') onCancel()
            }}
            placeholder="0"
          />
          <span className="dialog-input-suffix">{suffix}</span>
        </div>

        <div className="dialog-hint">
          Отрицательное число уменьшит план пропорционально
        </div>

        {parsed !== 0 && (
          <div className="dialog-preview">
            {multi && (
              <>
                <div className="dialog-preview-row">
                  <span className="dialog-preview-label">В день</span>
                  <span className="dialog-preview-value">
                    {formatSignedNumber(perDay)}
                    <span className="dialog-preview-unit">гл</span>
                  </span>
                </div>
                <div className="dialog-preview-divider" />
              </>
            )}
            <div className="dialog-preview-row">
              <span className="dialog-preview-label">Всего</span>
              <span className="dialog-preview-value">
                {formatSignedNumber(totalDelta)}
                <span className="dialog-preview-unit">гл</span>
              </span>
            </div>
          </div>
        )}

        <div className="dialog-sku-block">
          <div className="dialog-sku-head">
            <div className="dialog-sku-title-block">
              <span className="dialog-sku-title">По SKU</span>
              <span className="dialog-sku-counter">
                {nSel} / {beers.length}
              </span>
            </div>
            <div className="dialog-sku-quick">
              <button
                type="button"
                className={`dialog-sku-chip ${nSel === beers.length ? 'is-active' : ''}`}
                onClick={selectAllSkus}
              >
                Все
              </button>
              <button
                type="button"
                className={`dialog-sku-chip ${nSel === 0 ? 'is-active' : ''}`}
                onClick={selectNoneSkus}
              >
                Ни одного
              </button>
            </div>
          </div>
          <div className="dialog-sku-list">
            {skuRows.map((sku) => {
              const active = selectedSkuIds.has(sku.id)
              const share =
                active && totalWeightInSel > 0
                  ? sku.weight / totalWeightInSel
                  : active && nSel > 0
                    ? 1 / nSel
                    : 0
              const skuDelta = active ? Math.round(totalDelta * share) : 0
              return (
                <button
                  key={sku.id}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  className={`dialog-sku-row ${active ? 'is-active' : ''}`}
                  onClick={() => toggleSku(sku.id)}
                >
                  <span className="dialog-sku-name" title={sku.name}>
                    {sku.name}
                  </span>
                  <span className="dialog-sku-current">
                    {formatNumber(sku.weight)}
                  </span>
                  <span
                    className={`dialog-sku-delta ${
                      skuDelta > 0 ? 'is-pos' : skuDelta < 0 ? 'is-neg' : ''
                    }`}
                  >
                    {active && totalDelta !== 0
                      ? formatSignedNumber(skuDelta)
                      : ''}
                  </span>
                  <span
                    className={`dialog-switch ${active ? 'is-on' : ''}`}
                    aria-hidden="true"
                  >
                    <span className="dialog-switch-thumb" />
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="dialog-actions">
          <button className="dialog-cancel" onClick={onCancel}>
            Отмена
          </button>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={!canSubmit}
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  )
}

function formatSignedNumber(n) {
  if (n > 0) return '+' + formatNumber(n)
  if (n < 0) return '−' + formatNumber(Math.abs(n))
  return formatNumber(0)
}
