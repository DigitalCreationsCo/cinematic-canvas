import { describe, it, expect } from 'vitest';

describe('Cinematic Canvas Button Styles', () => {
    it('should have the correct transition timing for the container', () => {
        const styles = window.getComputedStyle(document.querySelector('.btn-cinematic')!);
        expect(styles.transitionDuration).toBe('0.6s');
    });

    it('should apply the scaling animation on hover state simulation', async () => {
        const btn = document.querySelector('.btn-cinematic');
        const text = document.querySelector('.btn-cinematic-text');

        // Simulate Hover
        btn?.dispatchEvent(new MouseEvent('mouseenter'));

        const animationName = window.getComputedStyle(text!).animationName;
        expect(animationName).toBe('text-scale-cinematic');
    });
});