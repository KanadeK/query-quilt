import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { WorkflowExecution } from '../../adapters';
import { displayCell, numericColumns } from './model';

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

export interface ChartViewHandle {
  toPng(): string | null;
}

interface ChartViewProps {
  execution: WorkflowExecution | null;
}

export const ChartView = forwardRef<ChartViewHandle, ChartViewProps>(function ChartView(
  { execution },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const configuration = useMemo(() => {
    if (!execution || execution.rows.length === 0) {
      return null;
    }
    const numbers = numericColumns(execution.columns, execution.rows);
    const valueColumn = numbers[0];
    if (!valueColumn) {
      return null;
    }
    const labelColumn =
      execution.columns.find((column) => column.name !== valueColumn.name) ?? execution.columns[0];
    if (!labelColumn) {
      return null;
    }
    const rows = execution.rows.slice(0, 40);
    return {
      label: labelColumn.name,
      value: valueColumn.name,
      labels: rows.map((row) => displayCell(row[labelColumn.name])),
      values: rows.map((row) => {
        const value = row[valueColumn.name];
        return typeof value === 'bigint' ? Number(value) : Number(value);
      }),
    };
  }, [execution]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !configuration) {
      chartRef.current?.dispose();
      chartRef.current = null;
      return;
    }

    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.setOption({
      animationDuration: 260,
      color: ['#18775b'],
      grid: { left: 48, right: 18, top: 34, bottom: 72 },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        name: configuration.label,
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          interval: 0,
          rotate: configuration.labels.length > 8 ? 30 : 0,
          color: '#5c665f',
        },
        data: configuration.labels,
      },
      yAxis: {
        type: 'value',
        name: configuration.value,
        nameTextStyle: { color: '#5c665f' },
        splitLine: { lineStyle: { color: '#dde1d8' } },
      },
      series: [
        {
          type: 'bar',
          data: configuration.values,
          barMaxWidth: 42,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
      ],
    });

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      chart.dispose();
      if (chartRef.current === chart) {
        chartRef.current = null;
      }
    };
  }, [configuration]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      toPng() {
        return (
          chartRef.current?.getDataURL({
            type: 'png',
            pixelRatio: 2,
            backgroundColor: '#f8f8f3',
          }) ?? null
        );
      },
    }),
    [],
  );

  return (
    <div className="chart-stage">
      <div
        className="chart-canvas"
        ref={containerRef}
        hidden={!configuration}
        role={configuration ? 'img' : undefined}
        aria-label={
          configuration
            ? `Bar chart of ${configuration.value} by ${configuration.label}`
            : undefined
        }
      />
      {!configuration && (
        <div className="empty-chart">
          <span>Run a workflow with at least one numeric result column to draw a chart.</span>
        </div>
      )}
    </div>
  );
});
