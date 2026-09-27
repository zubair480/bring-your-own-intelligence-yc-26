// Mirrors the shape of an Ignition Perspective coordinate-container view.
// Each component carries its fixed-mode position, which is what lets the
// overlay map a click to a component without touching the Perspective DOM.

export const VIEW = {
  name: 'pump_station_overview',
  project: 'station-01',
  width: 1280,
  height: 720,
}

export interface Comp {
  id: string
  name: string
  type: string
  path: string
  x: number
  y: number
  w: number
  h: number
  container?: boolean
  suggestions: string[]
}

export const COMPONENTS: Comp[] = [
  { id: 'header', name: 'Header', type: 'ia.container.flex', path: 'root/Header', x: 0, y: 0, w: 1280, h: 64, container: true,
    suggestions: ['Add a shift clock on the right', 'Make the station name larger'] },
  { id: 'process', name: 'Process', type: 'ia.container.coord', path: 'root/Process', x: 332, y: 80, w: 932, h: 460, container: true,
    suggestions: ['Add pump P-104 below P-103', 'Show flow direction arrows on pipes'] },
  { id: 'alarms', name: 'Active Alarms', type: 'ia.display.alarmstatustable', path: 'root/Alarms', x: 16, y: 80, w: 300, h: 460,
    suggestions: ['Only show priority High and above', 'Add an Ack All button'] },
  { id: 'trend', name: 'Level Trend', type: 'ia.chart.timeseries', path: 'root/Trend', x: 16, y: 556, w: 1248, h: 148,
    suggestions: ['Change the range to 8 hours', 'Add the flow rate as a second axis'] },
  { id: 'kpi_pumps', name: 'Pumps Running', type: 'ia.display.label', path: 'root/Header/KpiPumps', x: 560, y: 8, w: 200, h: 48,
    suggestions: ['Show as 2 of 3 with a bar', 'Bind to Station01 pump count'] },
  { id: 'kpi_flow', name: 'Discharge Flow', type: 'ia.display.label', path: 'root/Header/KpiFlow', x: 780, y: 8, w: 220, h: 48,
    suggestions: ['Switch units to m³/h', 'Add a 1-hour sparkline'] },
  { id: 'kpi_level', name: 'T-101 Level', type: 'ia.display.label', path: 'root/Header/KpiLevel', x: 1020, y: 8, w: 244, h: 48,
    suggestions: ['Show both tanks here', 'Turn amber above 80 %'] },
  { id: 'T101', name: 'T-101', type: 'ia.display.cylindricaltank', path: 'root/Process/T101', x: 386, y: 100, w: 148, h: 300,
    suggestions: ['Show HI and LO limit marks', 'Bind level to [default]Station01/T-101/LevelPct'] },
  { id: 'T102', name: 'T-102', type: 'ia.display.cylindricaltank', path: 'root/Process/T102', x: 626, y: 100, w: 148, h: 300,
    suggestions: ['Show HI and LO limit marks', 'Add volume in gallons under the level'] },
  { id: 'V202', name: 'V-202', type: 'ia.symbol.valve', path: 'root/Process/V202', x: 552, y: 420, w: 56, h: 64,
    suggestions: ['Show open percent next to the valve', 'Open the faceplate on click'] },
  { id: 'P101', name: 'P-101', type: 'ia.symbol.pump', path: 'root/Process/P101', x: 840, y: 118, w: 80, h: 92,
    suggestions: ['Show running state per our standard', 'Add speed % and amps under the pump'] },
  { id: 'P102', name: 'P-102', type: 'ia.symbol.pump', path: 'root/Process/P102', x: 840, y: 228, w: 80, h: 92,
    suggestions: ['Show running state per our standard', 'Add speed % and amps under the pump'] },
  { id: 'P103', name: 'P-103', type: 'ia.symbol.pump', path: 'root/Process/P103', x: 840, y: 338, w: 80, h: 92,
    suggestions: ['Show the fault reason on hover', 'Add a reset button'] },
  { id: 'V201', name: 'V-201', type: 'ia.symbol.valve', path: 'root/Process/V201', x: 1054, y: 252, w: 60, h: 70,
    suggestions: ['Show open percent next to the valve', 'Open the faceplate on click'] },
  { id: 'FT301', name: 'FT-301', type: 'ia.symbol.sensor', path: 'root/Process/FT301', x: 1146, y: 244, w: 70, h: 96,
    suggestions: ['Show totalized flow for today', 'Turn amber below 900 GPM'] },
]

export const TAG = (equip: string, point: string) => `[default]Station01/${equip}/${point}`
