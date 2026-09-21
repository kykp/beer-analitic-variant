import { useMemo, useState } from 'react'
import {
  beerData as initialBeerData,
  currentMonthKey,
  getMonthDays,
  getMonthLabel,
  shiftMonth,
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

export default function App() {
  const [beers, setBeers] = useState(initialBeerData)
  const [selectedId, setSelectedId] = useState(null)

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

  const totals = useMemo(() => {
    const byDay = {}
    for (const day of monthDays) {
      byDay[day] = beerRows.reduce((s, b) => s + b.salesByDay[day], 0)
    }
    const grand = Object.values(byDay).reduce((s, v) => s + v, 0)
    return { byDay, grand }
  }, [beerRows, monthDays])

  const selected = selectedId ? beers.find((b) => b.id === selectedId) : null

  function updateBeerSales(beerId, nextSalesByDay) {
    setBeers((prev) => prev.map((b) => (b.id === beerId ? { ...b, salesByDay: nextSalesByDay } : b)))
  }

  if (selected) {
    return (
      <BeerDetails
        beer={selected}
        onBack={() => setSelectedId(null)}
        onChange={(next) => updateBeerSales(selected.id, next)}
      />
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>План продаж пива</h1>
        <p className="subtitle">
          {monthLabel} · план на месяц <strong>{formatNumber(totals.grand)}</strong> шт.
        </p>
      </header>

      <div className="table-wrap">
        <div className="table-scroll">
          <table className="beer-table days-table">
            <thead>
              <tr>
                <th className="sticky-col name-col">Пиво</th>
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
              {beerRows.map((beer) => (
                <tr
                  key={beer.id}
                  className="row-clickable"
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

      <p className="hint">Кликни по строке, чтобы открыть карточку и редактировать план</p>
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
  const [focusMonth, setFocusMonth] = useState(currentMonthKey)
  const [editing, setEditing] = useState(null)

  const focusDays = useMemo(() => getMonthDays(focusMonth), [focusMonth])
  const focusTotal = focusDays.reduce((s, d) => s + beer.salesByDay[d], 0)
  const avg = Math.round(focusTotal / focusDays.length)
  const maxInFocus = Math.max(...focusDays.map((d) => beer.salesByDay[d]))

  function applyValue(value, scope, anchorDay) {
    const anchor = new Date(anchorDay)
    const anchorDow = anchor.getDay()
    const anchorMonthKey = anchorDay.slice(0, 7)
    const monthDays = getMonthDays(anchorMonthKey)
    const next = { ...beer.salesByDay }
    for (const day of monthDays) {
      const d = new Date(day)
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      const sameDow = d.getDay() === anchorDow
      const fromAnchor = day >= anchorDay
      if (
        (scope === 'one' && day === anchorDay) ||
        scope === 'all' ||
        (scope === 'weekdays' && !isWeekend) ||
        (scope === 'weekends' && isWeekend) ||
        (scope === 'same-dow' && sameDow) ||
        (scope === 'from-here' && fromAnchor)
      ) {
        next[day] = value
      }
    }
    onChange(next)
    setEditing(null)
  }

  const visibleMonths = [shiftMonth(focusMonth, -1), focusMonth, shiftMonth(focusMonth, 1)]

  return (
    <div className="page">
      <button className="back" onClick={onBack}>
        ← Назад к списку
      </button>
      <header className="page-header">
        <h1>{beer.name}</h1>
        <p className="subtitle">
          {beer.style} · {beer.brewery} · {beer.abv.toFixed(1)}%
        </p>
      </header>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">План на {getMonthLabel(focusMonth)}</div>
          <div className="stat-value">{formatNumber(focusTotal)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">В среднем в день</div>
          <div className="stat-value">{formatNumber(avg)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Максимум за день</div>
          <div className="stat-value">{formatNumber(maxInFocus)}</div>
        </div>
      </div>

      <div className="calendar-toolbar">
        <button
          className="nav-btn"
          onClick={() => setFocusMonth(shiftMonth(focusMonth, -1))}
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>
        <div className="calendar-toolbar-title">{getMonthLabel(focusMonth)}</div>
        <button
          className="nav-btn"
          onClick={() => setFocusMonth(shiftMonth(focusMonth, 1))}
          aria-label="Следующий месяц"
        >
          ›
        </button>
        {focusMonth !== currentMonthKey && (
          <button className="btn-link" onClick={() => setFocusMonth(currentMonthKey)}>
            Сегодня
          </button>
        )}
      </div>

      <div className="calendars-row">
        {visibleMonths.map((mk) => (
          <MonthCalendar
            key={mk}
            monthKey={mk}
            focused={mk === focusMonth}
            beer={beer}
            maxValue={maxInFocus}
            onFocus={() => setFocusMonth(mk)}
            onEdit={(day) => {
              setFocusMonth(mk)
              setEditing(day)
            }}
          />
        ))}
      </div>

      {editing && (
        <EditDialog
          day={editing}
          current={beer.salesByDay[editing]}
          onCancel={() => setEditing(null)}
          onApply={applyValue}
        />
      )}
    </div>
  )
}

function MonthCalendar({ monthKey, focused, beer, maxValue, onFocus, onEdit }) {
  const days = useMemo(() => getMonthDays(monthKey), [monthKey])
  const weeks = useMemo(() => buildCalendarWeeks(days), [days])
  const label = getMonthLabel(monthKey)
  const total = days.reduce((s, d) => s + beer.salesByDay[d], 0)

  return (
    <div className={`calendar ${focused ? 'focused' : 'faded'}`} onClick={focused ? undefined : onFocus}>
      <div className="calendar-header">
        <div className="calendar-header-title">{label}</div>
        <div className="calendar-header-total">{formatNumber(total)} шт.</div>
      </div>
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
              if (!day) return <div key={di} className="calendar-cell empty" />
              const h = dayInfo(day)
              const val = beer.salesByDay[day]
              const intensity = maxValue > 0 ? val / maxValue : 0
              return (
                <button
                  key={day}
                  className={`calendar-cell ${h.isPast ? 'past' : ''} ${h.isToday ? 'today' : ''} ${h.isWeekend ? 'weekend' : ''}`}
                  style={{ '--intensity': intensity }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit(day)
                  }}
                >
                  <div className="cell-day">{h.num}</div>
                  <div className="cell-val">{formatNumber(val)}</div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function EditDialog({ day, current, onCancel, onApply }) {
  const [value, setValue] = useState(String(current))
  const d = new Date(day)
  const label = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'long'
  })
  const dowLabel = d.toLocaleDateString('ru-RU', { weekday: 'long' })
  const isWeekend = d.getDay() === 0 || d.getDay() === 6

  function submit(scope) {
    const n = parseInt(value, 10)
    if (Number.isNaN(n) || n < 0) return
    onApply(n, scope, day)
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{label}</div>
        <input
          className="dialog-input"
          type="number"
          min="0"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit('one')
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="dialog-hint">Применить это число также:</div>
        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={() => submit('one')}>
            Только этот день
          </button>
          <button className="btn" onClick={() => submit('same-dow')}>
            Все {dowLabel === 'воскресенье' ? 'воскресенья' : dowLabel + 'и'}
          </button>
          {!isWeekend && (
            <button className="btn" onClick={() => submit('weekdays')}>
              Все будни
            </button>
          )}
          {isWeekend && (
            <button className="btn" onClick={() => submit('weekends')}>
              Все выходные
            </button>
          )}
          <button className="btn" onClick={() => submit('from-here')}>
            С этого дня до конца месяца
          </button>
          <button className="btn" onClick={() => submit('all')}>
            Все дни месяца
          </button>
        </div>
        <button className="dialog-cancel" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}
