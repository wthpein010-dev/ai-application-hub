import {describe,expect,it} from 'vitest';
import {selectReferenceSample} from '../../src/ui/reference-selection.js';
const left={id:'900121',referenceSampleKey:'sheep'};
const right={id:'level_0020-reference',referenceSampleKey:'paws'};
const sample={left,right};
describe('reference sample selection',()=>{
 it('loads both sample sides without discarding imported libraries or duplicating the sample',()=>{
  const importedLeft={id:'user-left'},importedRight={id:'user-right'};
  const original={defaultLeftLevels:[left],left:{levels:[left,importedLeft],selectedLevel:importedLeft},right:{levels:[importedRight],selectedLevel:importedRight}};
  const selected=selectReferenceSample(original,sample);
  expect(selected.left.selectedLevel).toBe(left);
  expect(selected.right.selectedLevel).toBe(right);
  expect(selected.left.levels).toContain(importedLeft);
  expect(selected.right.levels).toContain(importedRight);
  expect(selectReferenceSample(selected,sample).right.levels).toHaveLength(2);
  expect(original.right.selectedLevel).toBe(importedRight);
 });
});
