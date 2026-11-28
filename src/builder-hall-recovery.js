import {
  builderHallExteriorFootprint,
  builderHallPlacementFits,
  materializeBuilderHall,
  validateBuilderHallPlacement,
} from './builder-hall.js';
import {sceneBounds} from './world-bounds.js';

function nearestShift(points, lower, upper) {
  const min = lower - Math.min(...points);
  const max = upper - Math.max(...points);
  if (min > max) throw new Error('The legacy Exhibit hall footprint cannot fit inside the containing Place.');
  return {min,max,offset:Math.min(max,Math.max(min,0))};
}

function roundedInward({min,max,offset}) {
  if (!offset) return offset;
  const step = Math.max(1,Math.abs(min),Math.abs(max)) * Number.EPSILON * 8;
  return offset > 0 ? Math.min(max,offset+step) : Math.max(min,offset-step);
}

function moveExterior(plan, dx, dz) {
  const {layout} = plan.room;
  const {interior,arrivals} = layout;
  const {frontage} = interior;
  const move = ([x,z]) => [x+dx,z+dz];
  const door = move(frontage.door);
  const arrival = move(frontage.arrival);
  const outside = move(frontage.outside);
  return {
    ...plan,
    room:{...plan.room,layout:{
      ...layout,slot:door,approach:arrival,
      interior:{...interior,frontage:{...frontage,door,arrival,outside}},
      arrivals:{...arrivals,door:{...arrivals.door,position:arrival},outside:{...arrivals.outside,position:outside}},
    }},
    changes:plan.changes.map(change=>change.kind==='Path' ?
      {...change,fields:{...change.fields,position:door,before:arrival}} : change),
  };
}

// Old slabs could be published outside the walkable scene. Keep the original
// piece as evidence and fit only the reconstructed exterior into that scene.
export function materializeRecoveredBuilderHall(parent, piece, {visibility} = {}) {
  const plan = materializeBuilderHall(parent,piece,{visibility});
  if (builderHallPlacementFits(parent,plan.room)) return plan;

  const points = builderHallExteriorFootprint(plan.room);
  const {minX,maxX,minZ,maxZ} = sceneBounds(plan.room.layout.scene,parent.layout.interior);
  const x = nearestShift(points.map(point=>point[0]),minX,maxX);
  const z = nearestShift(points.map(point=>point[1]),minZ,maxZ);
  const shifted = moveExterior(plan,x.offset,z.offset);
  if (builderHallPlacementFits(parent,shifted.room)) return shifted;

  // An exact edge can round outwards when the rotated corners are recomputed.
  const shiftedPoints = builderHallExteriorFootprint(shifted.room);
  const crossesX = shiftedPoints.some(([px])=>px<minX||px>maxX);
  const crossesZ = shiftedPoints.some(([,pz])=>pz<minZ||pz>maxZ);
  const nudged = moveExterior(plan,crossesX?roundedInward(x):x.offset,crossesZ?roundedInward(z):z.offset);
  validateBuilderHallPlacement(parent,nudged.room);
  return nudged;
}
