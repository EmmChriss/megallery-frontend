import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Checkbox from '@mui/material/Checkbox'
import Container from '@mui/material/Container'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Modal from '@mui/material/Modal'
import OutlinedInput from '@mui/material/OutlinedInput'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import React, { useEffect, useRef, useState } from 'react'
import {
  ApiCollection,
  ApiCompareFunctionVariant,
  ApiDistanceFunctionVariant,
  ApiLayoutFilter,
  createCollection,
  finalizeCollection,
  getCollections,
  uploadFile,
} from './lib/api'
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

  const [collections, setCollections] = useState<ApiCollection[]>()
  const [currentCollection, setCurrentCollection] = useState<ApiCollection>()

  useEffect(() => {
    if (currentCollection === undefined) {
      appRef.current?.closeCollection()
    } else {
      appRef.current?.openCollection(currentCollection)
    }
  }, [currentCollection])

  useEffect(() => {
    if (appRef.current) {
      appRef.current.addEventListener('changed-collection', collection => {
        setCurrentCollection(collection)
      })
    }
  }, [appRef.current])

  const fetchCollections = async () => {
    setCollections(await getCollections())
  }

  useEffect(() => void fetchCollections(), [])

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
    } else if (type === 'time_hist') {
      setLayout({ type: 'time_hist', resolution: 'month' })
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
    } else if (layout.type === 'time_hist') {
      return (
        <>
          {/* Grid Distance */}
          <FormControl>
            <InputLabel id="label-hist-resolution">Hist Resolution</InputLabel>
            <Select
              labelId="label-hist-resolution"
              label="Hist Resolution"
              onChange={evt =>
                setLayout(
                  Object.assign({}, layout, {
                    resolution: evt.target.value,
                  }),
                )
              }
              value={layout.resolution}
            >
              <MenuItem value={'hour'}>Hour</MenuItem>
              <MenuItem value={'day'}>Day</MenuItem>
              <MenuItem value={'week'}>Week</MenuItem>
              <MenuItem value={'month'}>Month</MenuItem>
              <MenuItem value={'year'}>Year</MenuItem>
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

  const controls = (
    <>
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
                  <MenuItem value={'time_hist'}>Time Hist</MenuItem>
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
          <AccordionDetails>{selected?.id ?? 'None'}</AccordionDetails>
        </Accordion>
      </Container>
    </>
  )

  const [collectionName, setCollectionName] = useState('')

  const collectionSelector = (
    <>
      <Modal open={true}>
        <Container>
          <Box
            style={{
              height: '100vh',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Card style={{ padding: '8px' }}>
              <Typography mt={2} variant="h2" align="center">
                Collections
              </Typography>
              <Stack direction="column" spacing={1}>
                <Card>
                  <Stack
                    direction="row"
                    style={{ alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <Stack direction="row" spacing={4} style={{ alignItems: 'center' }}>
                      <Typography>Create collection</Typography>
                      <TextField
                        value={collectionName}
                        onChange={evt => setCollectionName(evt.target.value)}
                        label="Name"
                      />
                    </Stack>
                    <Box>
                      <Button
                        onClick={() =>
                          createCollection({ name: collectionName }).then(() => fetchCollections())
                        }
                      >
                        Create
                      </Button>
                    </Box>
                  </Stack>
                </Card>
                {collections === undefined ? (
                  <></>
                ) : (
                  collections.map(collection => (
                    <Card key={collection.id}>
                      <Stack
                        direction="row"
                        style={{ alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <Box>
                          <Typography>{collection.name}</Typography>
                        </Box>
                        <Box>
                          <Button component="label">
                            Upload
                            <input
                              accept="image/*"
                              type="file"
                              onChange={evt => {
                                Promise.all(
                                  [...(evt.target.files ?? [])].map(file =>
                                    uploadFile(collection.id, file),
                                  ),
                                ).then(fetchCollections)
                              }}
                              hidden
                              multiple
                            />
                          </Button>
                          {collection.finalized ? (
                            <Button onClick={() => setCurrentCollection(collection)}>Open</Button>
                          ) : (
                            <Button
                              onClick={() =>
                                finalizeCollection(collection.id).then(fetchCollections)
                              }
                            >
                              Finalize
                            </Button>
                          )}
                        </Box>
                      </Stack>
                    </Card>
                  ))
                )}
              </Stack>
            </Card>
          </Box>
        </Container>
      </Modal>
    </>
  )

  return (
    <>
      {/* Main canvas */}
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
        style={{ maxWidth: '100vw', maxHeight: '100vh' }}
      />

      {currentCollection === undefined ? collectionSelector : controls}
    </>
  )
}

export default App
