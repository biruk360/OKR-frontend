'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from 'recharts'

interface WeeklyRow {
  week: string
  on: number
  at: number
  off: number
  total: number
}

interface Props {
  objectives: WeeklyRow[]
  keyResults: WeeklyRow[]
}

export default function ProgressReportWeeklyBars({ objectives, keyResults }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Chart title="Objectives (last 10 weeks)" data={objectives} />
      <Chart title="Key results (last 10 weeks)" data={keyResults} />
    </div>
  )
}

function Chart({ title, data }: { title: string; data: WeeklyRow[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</p>
      <div style={{ width: '100%', height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="on" stackId="a" fill="#10b981" name="On track" />
            <Bar dataKey="at" stackId="a" fill="#f59e0b" name="At risk" />
            <Bar dataKey="off" stackId="a" fill="#ef4444" name="Off track" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
