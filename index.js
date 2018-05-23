import tinkerbell from 'tinkerbell'
import rosin from 'rosin'
import mitt from 'mitt'

function ease (t, b, c, d) {
  return (t === d) ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b
}

/**
 * TODO
 *
 * 1. option - setHeight: disable height adjustments on resize
 * 2. api - destroy: needs to reset slides back to initial state
 */

export default function snapback (slider) {
  /**
   * Hoisted variables
   */
  let width = slider.clientWidth
  let prevIndex = 0
  let index = 0
  let slidesCount = 0
  let position = 0
  let delta = 0
  let t = Date.now()
  let velo = 0
  let ticking = false
  let tick = null
  let totalTravel = 0

  /**
   * Contains slides
   */
  const track = document.createElement('div')
  track.style.cssText = `
    // position: absolute;
    // top: 0; left: 0; right: 0; bottom: 0;
  `

  /**
   * Events
   */
  const ev = mitt()

  /**
   * Limit to beginning and end
   */
  function clamp (i) {
    if (i > (slidesCount - 1)) {
      return (slidesCount - 1)
    } else if (i < 0) {
      return 0
    }

    return i
  }

  /**
   * TODO
   *
   * If slide width were to change on resize, it'll need
   * to re-calc the offsets as it does here.
   */
  function mount () {
    for (let i = slider.children.length - 1; i > -1; i--) {
      const slide = slider.children[i]

      totalTravel += slide.clientWidth

      track.insertBefore(slide, track.children[0])

      slidesCount++
    }

    slider.appendChild(track)

    reflow()

    totalTravel -= width
  }

  function reflow () {
    let offset = 0

    for (let i = 0; i < track.children.length; i++) {
      if (i > 0) {
        offset += (i / i) * ((track.children[i - 1].clientWidth / width) * 100)
      }

      const slide = track.children[i]
      slide.style.position = 'absolute'
      slide.style.top = 0
      slide.style.left = offset + '%'
    }

    slider.style.height = track.children[index].clientHeight + 'px'
  }

  /**
   * Called on each tick
   */
  function resize () {
    width = slider.clientWidth

    totalTravel = 0

    for (let i = 0; i < track.children.length; i++) {
      totalTravel += track.children[i].clientWidth
    }

    totalTravel -= width

    reflow()

    selectByIndex()
  }

  /**
   * Called after each cell selection
   */
  function reset () {
    tick = typeof tick === 'function' ? tick() : clearInterval(tick)
    ticking = false
    delta = 0
  }

  function setActiveSlide () {
    for (let i = 0; i < track.children.length; i++) {
      track.children[i].classList[i === index ? 'add' : 'remove']('is-selected')
    }
  }

  /**
   * Get position at index, either prevIndex or index
   */
  function getPosition (ind) {
    let travel = 0

    for (let i = 0; i < ind; i++) {
      travel += track.children[i].clientWidth
    }

    return Math.min(travel, totalTravel) * -1
  }

  function selectByVelocity () {
    setActiveSlide()

    let v = Math.abs(velo)
    let prev = getPosition(prevIndex)
    const end = getPosition(index)
    const curr = position
    let diff = Math.abs(end) - Math.abs(position)
    let d = diff

    /**
     * Prevent moving beyond first & last slide
     */
    const isAtZero = delta > 0 && index === 0 && prevIndex === 0
    const isAtLastSlide = Math.abs(end) > totalTravel // or >= ?

    ticking = true

    tick = setInterval(() => {
      if (v > 0.2) {
        v *= 1 - 0.1
        const c = (diff * (1 - (d / diff)))
        position = isAtZero || isAtLastSlide ? curr + c : curr - c
        track.style.transform = `translateX(${position}px)`
        d *= 1 - 0.1
      } else {
        reset()
        prevIndex !== index && ev.emit('settle', index)
      }
    }, (1000 / 60))
  }

  function selectByIndex () {
    setActiveSlide()

    ticking = true

    const nextSlideWidth = track.children[index].clientWidth
    const prev = position // getPosition(prevIndex)
    const next = getPosition(index)

    /**
     * Prevent from traveling beyond the last slide
     */
    if (Math.abs(next) > totalTravel) return reset()

    tick = tinkerbell(prev, next, 1000, ease)(v => {
      track.style.transform = `translateX(${v}px)`
      position = v
    }, () => {
      reset()
      prevIndex !== index && ev.emit('settle', index)
    })
  }

  function whichByDistance (delta, dir, slidesPast = 0) {
    const i = clamp(index + (slidesPast * dir * -1))
    const threshold = 0.2
    const currSlideWidth = track.children[i].clientWidth

    if (delta > currSlideWidth) {
      return whichByDistance(delta - currSlideWidth, dir, slidesPast + 1)
    } else if (delta > (currSlideWidth * threshold)) {
      return clamp(i - dir)
    } else if (delta < ((currSlideWidth * threshold) * -1)) {
      return clamp(i - dir)
    } else {
      return index
    }
  }

  function select (i) {
    prevIndex = index
    index = clamp(i)
    reset()
    prevIndex !== index && selectByIndex()
  }

  const drag = rosin(slider)

  drag.on('mousedown', (pos, e) => {
    if (ticking && tick) {
      reset()
    }
  })

  drag.on('drag', ({ x, y }, e) => {
    velo = ((x - delta) / (e.timeStamp - t)) * (1000 / 60)
    t = e.timeStamp
    delta = x
    track.style.transform = `translateX(${position + delta}px)`
  })

  drag.on('mouseup', () => {
    t = null

    let dir = delta < 0 ? -1 : 1
    let v = Math.abs(velo)

    position = position + delta

    let x = 0
    if (v > 0.7) {
      while (v > 0.7) {
        v *= 1 - 0.2
        x += v
      }
    }

    prevIndex = index
    index = whichByDistance(Math.abs(delta) + x, dir)

    if (prevIndex !== index) {
      ev.emit('select', index)
    }

    v > 0.7 ? selectByVelocity() : selectByIndex()
  })

  window.addEventListener('resize', () => {
    requestAnimationFrame(resize)
  })

  mount()
  setActiveSlide()

  return {
    on: ev.on,
    resize,
    select,
    get index () {
      return index
    },
    prev () {
      select(index - 1)
    },
    next () {
      select(index + 1)
    }
  }
}
