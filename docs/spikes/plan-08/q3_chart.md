dayChart is not reused (Q3 answer: no). Its geometry is fixed to a 24 h x-axis of 144 nodes with three named series and a band, its
paths are built for those four arrays, and the axis ticks are clock times; a sweep chart needs an arbitrary x range and unit, optional
band, optional C1 line and a flat or curve control kind, and a lane chart needs five units and a C1 that can be missing. Adding an x-axis
option, a series count and the ticks would change well over 30 lines of dayChart and its pinned tests, so `laneChart` and `sweepChart`
are separate molecules that reuse the same CSS vocabulary and token names.
