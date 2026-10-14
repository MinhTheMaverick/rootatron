'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildPrompt}=require('../frontend/ai-starting-values.js');
const parameters = n => Array.from({length:n}, (_,i)=>({name:`parameter_${i}`}));
test('ten parameters keep index order and full precision; XY respects the fit range',()=>{
 const text=buildPrompt({formula:'[0]+[9]*x',x:[-1,0,1,2],y:[999,1.23456789012345,3,999],ex:[],ey:[0.25],x_range:[0,1],initial_guesses:['1e-12'],param_names:[]},parameters(10));
 assert.ok(text.indexOf('[8]: parameter_8')<text.indexOf('[9]: parameter_9'));
 assert.match(text,/current guess: 1e-12/);
 assert.match(text,/0,1\.23456789012345,,0\.25\n1,3,,0\.25/);
 assert.doesNotMatch(text,/999/);
 assert.doesNotMatch(text,/uncle|aunty/);
});
test('multivariate export quotes labels, broadcasts uncertainties, and shares parameter indices',()=>{
 const text=buildPrompt({analysis_type:'multivariate',models:['[0]*x0+[2]*x1','[1]+[2]*x0'],inputs:[[1,2],[3,4]],outputs:[[5,6],[7,8]],input_names:['position, mm','height'],output_names:['counts','signal'],input_errors:[[0.1],[]],output_errors:[[0],[0.2,0.3]]},parameters(3));
 assert.match(text,/"x0: position, mm",uncertainty_x0/);
 assert.match(text,/1,0\.1,3,,5,0,7,0\.2/);
 assert.match(text,/2,0\.1,4,,6,0,8,0\.3/);
 assert.match(text,/indices are shared/);
 assert.equal((text.match(/\[2\]:/g)||[]).length,1);
});
test('histogram export preserves unequal bin widths and zero counts with correct model semantics',()=>{
 const text=buildPrompt({analysis_type:'histogram',formula:'gausn',histogram:{source:'counts',counts:[0,12],edges:[0,1,4],method:'poisson'},x_range:[0,3]},parameters(3));
 assert.match(text,/bin_low,bin_high,count\n0,1,0\n1,4,12/);
 assert.match(text,/Integrating it over a bin predicts/);
 assert.match(text,/empty bins included/);
 assert.match(text,/select bins by their centers/);
});
test('raw histogram samples keep binning settings and are not confused with bin counts',()=>{
 const text=buildPrompt({analysis_type:'histogram',formula:'gaus',histogram:{source:'samples',samples:[1,1,2],edges:[0,1.5,3],method:'chi2'}},parameters(3));
 assert.match(text,/"edges":\[0,1\.5,3\]/);
 assert.match(text,/sample\n1\n1\n2/);
 assert.match(text,/empty bins excluded/);
});
test('names, symbols, units, notes and missing guesses are included without inventing values',()=>{
 const text=buildPrompt({formula:'[0]*x',x:[1,2],y:[2,4],x_title:'time (s)',y_title:'distance (m)'},[{name:'velocity',symbol:'v'}],{notes:'Uniform motion'});
 assert.match(text,/velocity \(equation symbol: v\); current guess: \(blank\)/);
 assert.match(text,/time \(s\)/);
 assert.match(text,/Uniform motion/);
 assert.throws(()=>buildPrompt({},[]),/adjustable parameters/);
});
