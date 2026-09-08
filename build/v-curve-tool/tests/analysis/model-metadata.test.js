import {describe,expect,it} from 'vitest';
import {analyzeLevel,compareReports} from '../../src/analysis/report.js';
import referenceSamples from '../../src/data/reference-sample.json';
import {configurationFingerprint} from '../../src/analysis/model-definition.js';
import {assignTypes} from '../../src/analysis/deal.js';
const level={id:'sample',name:'sample',source:'paws',sourceFile:'sample.json',tiles:[0,1,2,3].map((id)=>({id,x:id*16,y:0,layer:1,type:1,moldType:1,metaType:0,metaData:0,presetColorType:1})),rules:{gameLevelOrder:2,limitedTypeMax:2,fullTypeMin:1,fullTypeMax:2},warnings:[]};
describe('versioned model evidence in reports',()=>{
 it('fingerprints features and source semantics that can change the actual deal',()=>{
  const ordinary={...level,tiles:Array.from({length:8},(_,id)=>({...level.tiles[0],id,x:id*16,type:-1})),rules:{...level.rules,fullTypeMax:4,funClearPercent:100},features:{flipEvery:0}};
  const flipped={...ordinary,features:{flipEvery:2}};
  expect(assignTypes(ordinary,0)).not.toEqual(assignTypes(flipped,0));
  expect(configurationFingerprint(ordinary)).not.toBe(configurationFingerprint(flipped));
  const sheep={...level,source:'sheep',rules:{...level.rules,limitedTypeMax:2}};
  expect(configurationFingerprint(sheep)).not.toBe(configurationFingerprint(level));
 });
 it('runs the reference engine rather than relabeling runtime results',()=>{
  const report=analyzeLevel(referenceSamples.sheep900121,{model:'reference',seeds:300,riverRestarts:20});
  expect(report.metrics.openingV).toBe(25);
  expect(report.metrics.mc25.p50).toBe(28);
  expect(report.metrics.mc50.p50).toBe(9);
  expect(report.curves.mc.at(-1)).toMatchObject({removed:151,samples:23});
  expect(report.modelNotes.join(' ')).toContain('离场');
 });
 it('marks explicit unsupported runtime mechanics as incomplete, not every metadata field',()=>{
  const report=analyzeLevel({...level,modelLimitations:['首关保障未完整模拟']},{model:'runtime',seeds:20,riverRestarts:1});
  expect(report.simulation.incomplete).toBe(true);
  expect(report.simulation.incompleteReason).toContain('首关保障');
 });
 it('records the actual model and a deterministic configuration fingerprint',()=>{
  const report=analyzeLevel(level,{model:'runtime',seeds:20,riverRestarts:1});
  expect(report.model).toMatchObject({id:'runtime',sideLock:false,progressDefinition:'removed'});
  expect(report.level.configurationFingerprint).toMatch(/^fnv1a32:[a-f0-9]{8}$/);
  const changed=analyzeLevel({...level,rules:{...level.rules,fullTypeMax:3}},{model:'runtime',seeds:20,riverRestarts:1});
  expect(changed.level.configurationFingerprint).not.toBe(report.level.configurationFingerprint);
  expect(compareReports(report,report).model.id).toBe('runtime');
 });
 it('rejects mixing models under a single comparison heading',()=>{
  const report=analyzeLevel(level,{seeds:20,riverRestarts:1});
  expect(()=>compareReports({...report,model:{id:'reference',version:'1'}},{...report,model:{id:'runtime',version:'1'}})).toThrow(/模型/);
 });
});
