'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../frontend/modern.html'),'utf8');
const built=fs.readFileSync(path.join(__dirname,'../frontend/ai-starting-values.js'),'utf8');   // controls that script adds to the page
global.window={};
require('../frontend/tutorials/first-fit.js');
const lesson=global.window.TutorialLessons['first-fit'];

test('every lesson step is unique, reachable, says one thing to do and points at a control that exists',()=>{
 const ids=lesson.steps.map(s=>s.id);
 assert.equal(new Set(ids).size,ids.length);
 for(const s of lesson.steps){
  assert.ok(s.say,s.id+' needs an instruction');
  assert.ok(s.phase,s.id+' needs a phase');
  if(typeof s.target==='string'){const m=s.target.match(/^#([\w-]+)$/);assert.ok(m,s.id+' target must be an id');assert.ok(html.includes(`id="${m[1]}"`)||built.includes(`'${m[1]}'`),s.id+' points at a missing control '+s.target);}
  if(typeof s.next==='string')assert.ok(ids.includes(s.next),s.id+' next');
  for(const c of s.choices||[])assert.ok(ids.includes(c.goto),s.id+' choice '+c.id);
  // the user does each step: it moves on when the app shows it was done, or when the user confirms what they see
  assert.ok(s.choices||s.final||s.checks||typeof s.done==='function',s.id+' needs a done check or Confirm checks');
  if(s.checks)assert.ok(!s.done,s.id+' has both checks and a done check');
  for(const k of ['right','wrong','inset'])if(s[k])assert.ok(s[k].pic&&s[k].cap,s.id+' '+k+' panel needs a picture and a caption');
 }
 const branches=new Set(lesson.steps.flatMap(s=>s.choices||[]).map(c=>c.id));
 for(const s of lesson.steps)if(s.branch)assert.ok(branches.has(s.branch),s.id+' branch');
 assert.ok(branches.has(lesson.defaultBranch),'default branch');
 assert.ok(lesson.steps.at(-1).final,'the last step is the congratulations');
});

test('the tutorial data file holds the 80 fitted double-slit points with a header the table recognises',()=>{
 const csv=fs.readFileSync(path.join(__dirname,'../frontend/tutorials/double-slit.csv'),'utf8').trim().split('\n');
 assert.equal(csv[0],'x,y,y uncertainty');
 assert.equal(csv.length,81);
 const x=csv.slice(1).map(l=>+l.split(',')[0]);
 assert.equal(x[0],3.65);assert.equal(x[79],7.6);
 const sv=require('../frontend/setup-view.js');
 const XY=[{id:'x',label:'X',kind:'value'},{id:'y',label:'Y',kind:'value'},{id:'ex',label:'X uncertainty',of:'x',kind:'unc'},{id:'ey',label:'Y uncertainty',of:'y',kind:'unc'}];
 assert.deepEqual(sv.matchHeader(csv[0].split(','),XY),[0,1,3]);
 assert.ok(fs.existsSync(path.join(__dirname,'../frontend/tutorials/double-slit.xlsx')));
});
