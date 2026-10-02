import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
)

// Chart tooltips match the dashboard tooltip: near-black pill, white text.
ChartJS.defaults.plugins.tooltip.backgroundColor = '#0b0b10'
ChartJS.defaults.plugins.tooltip.titleColor = '#ffffff'
ChartJS.defaults.plugins.tooltip.bodyColor = '#ffffff'
ChartJS.defaults.plugins.tooltip.cornerRadius = 12
ChartJS.defaults.plugins.tooltip.padding = { top: 8, bottom: 8, left: 12, right: 12 }
ChartJS.defaults.plugins.tooltip.titleFont = { weight: 600, size: 12.5 }
ChartJS.defaults.plugins.tooltip.bodyFont = { weight: 600, size: 12.5 }
ChartJS.defaults.plugins.tooltip.boxPadding = 4
