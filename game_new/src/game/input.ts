export const input = {
  left: false,
  right: false,
  handbrake: false,
  brake: false,
  touchLeft: false,
  touchRight: false,
  touchDrift: false,
}

export function getSteer() {
  let s = 0
  if (input.left || input.touchLeft) s -= 1
  if (input.right || input.touchRight) s += 1
  return s
}

export function getHandbrake() {
  return input.handbrake || input.touchDrift
}

let bound = false
export function bindKeyboard() {
  if (bound) return
  bound = true
  const setKey = (e: KeyboardEvent, down: boolean) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        input.left = down
        e.preventDefault()
        break
      case 'ArrowRight':
      case 'KeyD':
        input.right = down
        e.preventDefault()
        break
      case 'Space':
      case 'ShiftLeft':
      case 'ShiftRight':
        input.handbrake = down
        e.preventDefault()
        break
      case 'ArrowDown':
      case 'KeyS':
        input.brake = down
        e.preventDefault()
        break
    }
  }
  window.addEventListener('keydown', (e) => setKey(e, true))
  window.addEventListener('keyup', (e) => setKey(e, false))
  window.addEventListener('blur', () => {
    input.left = input.right = input.handbrake = input.brake = false
  })
}
