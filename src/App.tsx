import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Container from '@mui/material/Container'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import OutlinedInput from '@mui/material/OutlinedInput'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import React, { useEffect, useRef, useState } from 'react'
import { ApiCompareFunctionVariant, ApiDistanceFunctionVariant, ApiLayoutFilter } from './lib/api'
import { App as LibApp } from './lib/app'
import { GraphicsDrawCommand } from './lib/graphics'
import { LayoutDescriptor } from './lib/layout'

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<LibApp>()

  useEffect(() => {
    if (canvasRef.current === null || appRef.current !== undefined) return

    appRef.current = new LibApp(canvasRef.current)
  }, [canvasRef.current])

  type AccordionPanels = 'filter' | 'layout' | 'select'
  const [openAccordion, setOpenAcoordion] = useState<AccordionPanels>()
  const handleOpenAccordion =
    (panel: AccordionPanels) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
      setOpenAcoordion(isExpanded ? panel : undefined)
    }

  // Control state
  const [filter, setFilter] = useState<ApiLayoutFilter>({})
  const [layout, setLayout] = useState<LayoutDescriptor>({ type: 'grid' })

  const setDefaultLayout = (type: LayoutDescriptor['type']) => {
    if (type === 'grid') {
      setLayout({ type: 'grid' })
    } else if (type === 'grid_expansion') {
      setLayout({
        type: 'grid_expansion',
        compare: { type: 'signed_dist', dist: { type: 'palette' } },
        anchor: 'center',
        grid_dist: 'pythegorean',
      })
    } else if (type === 'sort') {
      setLayout({ type: 'sort', compare: { type: 'signed_dist', dist: { type: 'palette' } } })
    } else if (type === 'tsne') {
      setLayout({ type: 'tsne', dist: { type: 'palette' } })
    }
  }

  const [selected, setSelected] = useState<GraphicsDrawCommand>()
  useEffect(() => {
    if (appRef.current === undefined) return

    const cb = (selected?: GraphicsDrawCommand) => {
      setSelected(selected)
    }

    appRef.current.selector.addEventListener('changed-selected', cb)
  }, [appRef.current])

  useEffect(() => {
    if (layout.type === 'grid_expansion' && layout.compare.type === 'comparative_dist') {
      layout.compare.compared_to = selected?.id ?? ''
    }
  }, [selected])

  const layoutDistFunction = (
    value: ApiDistanceFunctionVariant,
    setValue: (dist: ApiDistanceFunctionVariant) => void,
  ) => {
    return (
      <>
        <FormControl>
          <InputLabel id="label-dist">Distance Function</InputLabel>
          <Select
            labelId="label-dist"
            label="Distance Function"
            onChange={evt => setValue(Object.assign({}, value, { type: evt.target.value }))}
            value={value.type}
          >
            <MenuItem value={'palette'}>Palette</MenuItem>
            <MenuItem value={'palette_cos'}>Palette Cos</MenuItem>
            <MenuItem value={'date_time'}>DateTime</MenuItem>
          </Select>
        </FormControl>
      </>
    )
  }

  const layoutCompareFunction = (
    value: ApiCompareFunctionVariant,
    setValue: (compare: ApiCompareFunctionVariant) => void,
  ) => {
    return (
      <>
        <FormControl>
          <InputLabel id="label-compare">Compare Function</InputLabel>
          <Select
            labelId="label-compare"
            label="Compare Function"
            onChange={evt => setValue(Object.assign({}, value, { type: evt.target.value }))}
            value={value.type}
          >
            <MenuItem value={'signed_dist'}>Signed Distance</MenuItem>
            <MenuItem value={'comparative_dist'}>Comparative Distance</MenuItem>
          </Select>
        </FormControl>

        {(() => {
          if (value.type === 'comparative_dist') {
            return <TextField disabled label="Selected" value={selected?.id ?? 'None'} />
          }
        })()}

        {(() => {
          if (value.type === 'signed_dist' || value.type === 'comparative_dist') {
            return (
              <>
                {layoutDistFunction(value.dist, dist =>
                  setValue(Object.assign({}, value, { dist })),
                )}
              </>
            )
          }
        })()}
      </>
    )
  }

  const layoutDependencies = () => {
    if (layout.type === 'grid') {
      return <></>
    } else if (layout.type === 'grid_expansion') {
      return (
        <>
          {/* Compare function */}
          {layoutCompareFunction(layout.compare, compare =>
            setLayout(Object.assign({}, layout, { compare })),
          )}

          {/* Anchor */}
          <FormControl>
            <InputLabel id="label-anchor">Anchor</InputLabel>
            <Select
              labelId="label-anchor"
              label="Anchor"
              onChange={evt => setLayout(Object.assign({}, layout, { anchor: evt.target.value }))}
              value={layout.anchor}
            >
              <MenuItem value={'top_left'}>Top Left</MenuItem>
              <MenuItem value={'top_right'}>Top Right</MenuItem>
              <MenuItem value={'bottom_left'}>Bottom Left</MenuItem>
              <MenuItem value={'bottom_right'}>Bottom Right</MenuItem>
              <MenuItem value={'center'}>Center</MenuItem>
            </Select>
          </FormControl>

          {/* Grid Distance */}
          <FormControl>
            <InputLabel id="label-grid-dist">Grid Distance</InputLabel>
            <Select
              labelId="label-grid-dist"
              label="Grid Distance"
              onChange={evt =>
                setLayout(
                  Object.assign({}, layout, {
                    grid_dist: evt.target.value,
                  }),
                )
              }
              value={layout.grid_dist}
            >
              <MenuItem value={'manhattan'}>Manhattan</MenuItem>
              <MenuItem value={'pseudo_pythegorean'}>Pseudo-Pythegorean</MenuItem>
              <MenuItem value={'pythegorean'}>Pythegorean</MenuItem>
            </Select>
          </FormControl>
        </>
      )
    } else if (layout.type === 'tsne') {
      return (
        <>
          {/* Distance function */}
          {layoutDistFunction(layout.dist, dist => setLayout(Object.assign({}, layout, { dist })))}
        </>
      )
    } else if (layout.type === 'sort') {
      return (
        <>
          {/* Compare function */}
          {layoutCompareFunction(layout.compare, compare =>
            setLayout(Object.assign({}, layout, { compare })),
          )}
        </>
      )
    }
  }

  return (
    <>
      {/* Main canvas */}
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        style={{ maxWidth: '100vw', maxHeight: '100vh' }}
      />

      {/* Controls */}
      <Container style={{ position: 'absolute', top: '1em', left: '1em', width: 'fit-content' }}>
        <Accordion expanded={openAccordion === 'filter'} onChange={handleOpenAccordion('filter')}>
          <AccordionSummary>Filter</AccordionSummary>
          <AccordionDetails>
            <Stack direction="column" spacing={1}>
              {/* Has metadata */}
              <FormControl>
                <InputLabel id="label-has-metadata">Has metadata</InputLabel>
                <Select
                  labelId="label-has-metadata"
                  multiple
                  value={filter.has_metadata === undefined ? [] : filter.has_metadata}
                  onChange={evt =>
                    setFilter(
                      Object.assign({}, filter, {
                        has_metadata:
                          typeof evt.target.value === 'string'
                            ? evt.target.value.split(',')
                            : evt.target.value,
                      }),
                    )
                  }
                  input={<OutlinedInput label="Tag" />}
                  renderValue={selected => selected.join(', ')}
                >
                  {['palette', 'date_time'].map(name => (
                    <MenuItem key={name} value={name}>
                      <Checkbox
                        checked={
                          filter.has_metadata !== undefined &&
                          filter.has_metadata.indexOf(name as 'palette' | 'date_time') > -1
                        }
                      />
                      <ListItemText primary={name} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Limit */}
              <TextField
                value={filter.limit === undefined ? '' : filter.limit}
                onChange={evt =>
                  setFilter(
                    Object.assign({}, filter, {
                      limit:
                        evt.target.value === '' ? undefined : Number.parseInt(evt.target.value),
                    }),
                  )
                }
              />

              {/* Submit button */}
              <Button onClick={() => appRef.current!.organizer.setFilter(filter)}>Submit</Button>
            </Stack>
          </AccordionDetails>
        </Accordion>
        <Accordion expanded={openAccordion === 'layout'} onChange={handleOpenAccordion('layout')}>
          <AccordionSummary>Layout</AccordionSummary>
          <AccordionDetails>
            <Stack direction="column" spacing={1}>
              {/* Main layout select */}
              <FormControl>
                <InputLabel id="label-layout">Layout</InputLabel>
                <Select
                  labelId="label-layout"
                  label="Layout"
                  onChange={evt => setDefaultLayout(evt.target.value as LayoutDescriptor['type'])}
                  value={layout.type}
                >
                  <MenuItem value={'grid'}>Grid</MenuItem>
                  <MenuItem value={'grid_expansion'}>Grid Expansion</MenuItem>
                  <MenuItem value={'tsne'}>Tsne</MenuItem>
                </Select>
              </FormControl>

              {layoutDependencies()}

              {/* Submit button */}
              <Button onClick={() => appRef.current!.organizer.setLayout(layout)}>Submit</Button>
            </Stack>
          </AccordionDetails>
        </Accordion>
        <Accordion expanded={openAccordion === 'select'} onChange={handleOpenAccordion('select')}>
          <AccordionSummary>Select</AccordionSummary>
          <AccordionDetails>SELECT BUTTONS</AccordionDetails>
        </Accordion>
      </Container>
    </>
  )
}

export default App
