import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as React from 'react'
import { Button } from '../components/ui/button'

describe('Cinematic Button Animation', () => {
    beforeEach(() => {
        // Mock getAnimations with subtree support
        if (!HTMLElement.prototype.getAnimations) {
            HTMLElement.prototype.getAnimations = vi.fn().mockReturnValue([])
        }
    })

    it('triggers "is-animating" className on hover', () => {
        render(<Button className="lock-animation">Hover Me</Button>)
        const button = screen.getByRole('button')

        fireEvent.mouseEnter(button)
        expect(button.classNameList.contains('is-animating')).toBe(true)
    })

    it('restarts animation if threshold 0.5 is exceeded', () => {
        const mockAnimation = {
            playState: 'running',
            currentTime: 600,
            effect: { getTiming: () => ({ duration: 1000 }) }
        }

        HTMLElement.prototype.getAnimations = vi.fn().mockReturnValue([mockAnimation])

        render(
            <Button className="lock-animation" restartThreshold={0.5}>
                Restart Test
            </Button>
        )
        const button = screen.getByRole('button')

        // First hover to start
        fireEvent.mouseEnter(button)

        // Second hover - should trigger restart because 600/1000 > 0.5
        fireEvent.mouseEnter(button)
        expect(button.classNameList.contains('is-animating')).toBe(true)
    })

    it('releases lock when cinematic keyframes end', () => {
        render(<Button className="lock-animation">End Test</Button>)
        const button = screen.getByRole('button')

        fireEvent.mouseEnter(button)
        expect(button.classNameList.contains('is-animating')).toBe(true)

        // Simulate bubbling animation event from child
        fireEvent(button, new AnimationEvent('animationend', {
            animationName: 'text-go-cinematic',
            bubbles: true
        }))

        expect(button.classNameList.contains('is-animating')).toBe(false)
    })

    it('recovers if isAnimatingRef is true but no animations are physically running', () => {
        HTMLElement.prototype.getAnimations = vi.fn().mockReturnValue([])

        render(<Button className="lock-animation" restartThreshold={0.1}>Recovery</Button>)
        const button = screen.getByRole('button')

        // Manually force internal state to locked (simulated)
        fireEvent.mouseEnter(button)

        // Second hover: getAnimations returns empty, should force reset and re-animate
        fireEvent.mouseEnter(button)
        expect(button.classNameList.contains('is-animating')).toBe(true)
    })
})