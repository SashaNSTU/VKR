// Поведенческие сигналы пользователя на странице.
//
// Использование (React hook):
//   const behaviorRef = useBehaviorTracker()
//   ...
//   const signals = behaviorRef.current.snapshot()
//
// snapshot() возвращает:
//   - time_on_page_ms — время от mount до сейчас;
//   - form_fill_ms    — время от первого input до сейчас (или null, если ввода не было);
//   - mouse_events / key_events / touch_events — количество событий.
//
// Bot обычно не двигает мышью и не касается клавиатуры. BAS Emulator может
// эмулировать клики, но фоновую активность (mousemove, scroll, keydown) почти
// никогда не делает.

import { useEffect, useRef } from 'react'

export function useBehaviorTracker() {
  const stateRef = useRef({
    mountTs: Date.now(),
    firstInputTs: null,
    mouse: 0,
    key: 0,
    touch: 0,
  })

  useEffect(() => {
    const s = stateRef.current

    const onMouse = () => { s.mouse += 1 }
    const onKey = () => {
      s.key += 1
      if (!s.firstInputTs) s.firstInputTs = Date.now()
    }
    const onInput = () => {
      if (!s.firstInputTs) s.firstInputTs = Date.now()
    }
    const onTouch = () => { s.touch += 1 }

    window.addEventListener('mousemove', onMouse, { passive: true })
    window.addEventListener('mousedown', onMouse, { passive: true })
    window.addEventListener('keydown', onKey, { passive: true })
    window.addEventListener('input', onInput, { passive: true, capture: true })
    window.addEventListener('touchstart', onTouch, { passive: true })

    return () => {
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('mousedown', onMouse)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('input', onInput, true)
      window.removeEventListener('touchstart', onTouch)
    }
  }, [])

  // Возвращаем стабильный объект с методом snapshot
  const refOut = useRef({
    snapshot() {
      const s = stateRef.current
      const now = Date.now()
      return {
        time_on_page_ms: now - s.mountTs,
        form_fill_ms: s.firstInputTs ? now - s.firstInputTs : null,
        mouse_events: s.mouse,
        key_events: s.key,
        touch_events: s.touch,
      }
    },
  })
  return refOut
}
