"use client"

import { useEffect, useState } from "react"

export function CustomCursor() {
  const [isHovering, setIsHovering] = useState(false)
  
  useEffect(() => {
    let mouseX = 0
    let mouseY = 0
    let cursorX = 0
    let cursorY = 0
    
    const cursor = document.getElementById("cursor")
    const ring = document.getElementById("cursor-ring")
    
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX
      mouseY = e.clientY
    }
    
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a') || target.closest('button')) {
        setIsHovering(true)
      }
    }
    
    const handleMouseOut = () => {
      setIsHovering(false)
    }
    
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseover", handleMouseOver)
    document.addEventListener("mouseout", handleMouseOut)
    
    let animationId: number
    
    const animate = () => {
      cursorX += (mouseX - cursorX) * 0.18
      cursorY += (mouseY - cursorY) * 0.18
      
      if (cursor) {
        cursor.style.left = `${mouseX}px`
        cursor.style.top = `${mouseY}px`
      }
      
      if (ring) {
        ring.style.left = `${cursorX}px`
        ring.style.top = `${cursorY}px`
      }
      
      animationId = requestAnimationFrame(animate)
    }
    
    animate()
    
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseover", handleMouseOver)
      document.removeEventListener("mouseout", handleMouseOut)
      cancelAnimationFrame(animationId)
    }
  }, [])
  
  return (
    <>
      <div 
        id="cursor" 
        className="fixed w-[10px] h-[10px] rounded-full pointer-events-none z-[9999] mix-blend-difference transition-all duration-200"
        style={{
          background: 'var(--color-gold, #c9a55a)',
          transform: 'translate(-50%, -50%)'
        }}
      />
      <div 
        id="cursor-ring"
        className={`fixed w-[36px] h-[36px] rounded-full pointer-events-none z-[9998] transition-all duration-300 ease-out ${isHovering ? 'w-[56px] h-[56px]' : ''}`}
        style={{
          border: '1px solid rgba(201,165,90,0.5)',
          transform: 'translate(-50%, -50%)',
          borderColor: isHovering ? 'var(--color-gold, #c9a55a)' : 'rgba(201,165,90,0.5)'
        }}
      />
    </>
  )
}