import React, { useState, useEffect } from 'react'
import Canvas from "./Canvas"

function App() {
  const [[width, height], setSize] = useState([window.innerWidth, window.innerHeight])

  useEffect(() => {
    const updateSize = () => {
      setSize([window.innerWidth, window.innerHeight])
    }
    
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("reize", updateSize)
  }, [])
  
  return <Canvas width={width} height={height} />
}

export default App;
