const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const r=(a,b)=>{const[x,y]=[L(a),L(b)].sort((p,q)=>q-p);return ((x+.05)/(y+.05)).toFixed(2)};
const bg='#0A0A1A',card='#141432';
for(const [n,a,b] of [['white on primary old','#FFFFFF','#6366F1'],['white on primarySolid','#FFFFFF','#4F46E5'],['primary old text on bg','#6366F1',bg],['primary old text on card','#6366F1',card],['primaryText on bg','#A5B4FC',bg],['primaryText on card','#A5B4FC',card],['muted on card','#909FB8',card],
 ...[['chart1 old','#1447E6'],['chart1','#818CF8'],['chart2','#34D399'],['chart3','#FBBF24'],['chart4','#C084FC'],['chart5','#FB7185']].map(([n,c])=>[n+' on card',c,card])]) console.log(n.padEnd(28),r(a,b));
