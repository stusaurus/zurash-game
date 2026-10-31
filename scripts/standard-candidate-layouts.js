// Experimental fixtures only. Each variant changes one variable from the control.
const base={size:9,target:4,walls:[1,9,12,28,30,50,52,68,71,79],stars:[6,13,29,34,40,46,51,67,74],players:[72,8]};
export const CANDIDATES=[
  {id:'control',intent:'PR50 control',...base},
  {id:'stars',intent:'Move the paired near-corner stars outward to alter scoring lanes',...base,stars:[6,14,29,34,40,46,51,66,74]},
  {id:'walls',intent:'Move the paired inner walls toward the edges to change stopping routes',...base,walls:[1,9,12,19,30,50,61,68,71,79]},
  {id:'starts',intent:'Move both starting positions one row toward the centre',...base,players:[63,17]},
];
