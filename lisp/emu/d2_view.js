  /* ===================== Предпросмотр: чтение готового DXF и отрисовка листа в SVG ===================== */
  function dxfModel(txt){
    var L=txt.split('\r\n'), n=L.length-1, i=0, sec=null, cur=null, M={layers:{},blocks:{},ents:[]}, blk=null;
    for(;i<n;i+=2){
      var c=parseInt(L[i],10), v=L[i+1];
      if(c===0){
        if(v==='SECTION'){ sec=L[i+3]; i+=2; cur=null; continue; }
        if(v==='ENDSEC'){ sec=null; cur=null; continue; }
        if(sec==='TABLES'){ cur=[[0,v]]; M._lyn=null; if(v==='LAYER') M._ly=cur; else M._ly=null; continue; }
        if(sec==='BLOCKS'){
          if(v==='BLOCK'){ blk={name:null,bx:0,by:0,ents:[],head:true}; cur=null; continue; }
          if(v==='ENDBLK'){ if(blk&&blk.name!=null) M.blocks[blk.name]=blk; blk=null; cur=null; continue; }
          cur=[[0,v]]; if(blk){ blk.head=false; blk.ents.push(cur); } continue;
        }
        if(sec==='ENTITIES'){ cur=[[0,v]]; M.ents.push(cur); continue; }
        cur=null; continue;
      }
      if(sec==='TABLES'&&M._ly){ if(c===2) M._lyn=v; if(c===62&&M._lyn!=null){ M.layers[M._lyn]=Math.abs(parseInt(v,10)); } continue; }
      if(sec==='BLOCKS'&&blk&&blk.head){ if(c===2&&blk.name==null) blk.name=v; else if(c===10) blk.bx=parseFloat(v); else if(c===20) blk.by=parseFloat(v); continue; }
      if(cur) cur.push([c,v]);
    }
    return M;
  }
  var ACI0={1:'#ff0000',2:'#c8b400',3:'#00a000',4:'#00a0a0',5:'#0000ff',6:'#c000c0',7:'#111111',8:'#808080',9:'#a0a0a0'};
  function dxfSheetSVG(Mdl,box,pxW){
    var x0=box[0],y0=box[1],x1=box[2],y1=box[3], W=x1-x0, H=y1-y0, sw=W/2600;
    var out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W.toFixed(0)+' '+H.toFixed(0)+'" width="'+(pxW||1200)+'" style="background:#fff;max-width:100%;height:auto" font-family="Arial, sans-serif">'];
    function g(e,c,d){ for(var i=0;i<e.length;i++) if(e[i][0]===c) return e[i][1]; return d; }
    function gf(e,c,d){ var v=g(e,c); return v==null?(d||0):parseFloat(v); }
    function col(e,inh){
      var t=g(e,420); if(t!=null){ var x=parseInt(t,10); return '#'+('00000'+x.toString(16)).slice(-6); }
      var c=g(e,62); c=c==null?256:parseInt(c,10);
      if(c===0) return inh; if(c===256) c=Mdl.layers[g(e,8)]||7; c=Math.abs(c);
      if(ACI0[c]) return ACI0[c];
      if(c>=250) { var gg=[51,80,105,130,190,255][c-250]; return 'rgb('+gg+','+gg+','+gg+')'; }
      return '#555';
    }
    function X(x){ return (x-x0).toFixed(1); } function Y(y){ return (y1-y).toFixed(1); }
    function inBox(x,y){ return x>x0-300&&x<x1+300&&y>y0-300&&y<y1+300; }
    function esc(t){ return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function mtxt(s){ return String(s).replace(/\\[ACcFfHhQTWp][^;]*;/g,'').replace(/\\P/g,'\n').replace(/[{}]/g,'').replace(/\\[LlOoKk]/g,'').replace(/\\\\/g,'\\'); }
    function draw(list,M,inh,depth){
      function tp(x,y){ return [M[0]*x+M[1]*y+M[2], M[3]*x+M[4]*y+M[5]]; }
      var sc=Math.sqrt(Math.abs(M[0]*M[4]-M[1]*M[3])), rotM=Math.atan2(M[3],M[0])*180/Math.PI, flip=(M[0]*M[4]-M[1]*M[3])<0;
      for(var i=0;i<list.length;i++){
        var e=list[i], t=e[0][1];
        if(g(e,60)==='     1'||g(e,60)==='1'){ if(t!=='INSERT') continue; }
        var c=col(e,inh);
        if(t==='LINE'){ var a=tp(gf(e,10),gf(e,20)), b=tp(gf(e,11),gf(e,21)); if(inBox(a[0],a[1])||inBox(b[0],b[1])) out.push('<line x1="'+X(a[0])+'" y1="'+Y(a[1])+'" x2="'+X(b[0])+'" y2="'+Y(b[1])+'" stroke="'+c+'" stroke-width="'+sw.toFixed(1)+'"/>'); }
        else if(t==='LWPOLYLINE'||t==='HATCH'){
          var pts=[], bul=[], start=t==='LWPOLYLINE', skipFirst=t==='HATCH';
          for(var k=0;k<e.length;k++){ var cc=e[k][0];
            if(t==='HATCH'){ if(cc===93){ start=true; continue; } if(cc===97) break; }
            if(!start) continue;
            if(cc===10) { pts.push([parseFloat(e[k][1]),0]); bul.push(0); } else if(cc===20&&pts.length) pts[pts.length-1][1]=parseFloat(e[k][1]); else if(cc===42&&bul.length&&t==='LWPOLYLINE') bul[bul.length-1]=parseFloat(e[k][1]); }
          if(pts.length<2) continue;
          var q=pts.map(function(p){ return tp(p[0],p[1]); }); if(!q.some(function(p){ return inBox(p[0],p[1]); })) continue;
          var d='M'+X(q[0][0])+' '+Y(q[0][1]);
          var closed=t==='HATCH'||(parseInt(g(e,70,'0'),10)&1);
          var nseg=closed?q.length:q.length-1;
          for(var s=0;s<nseg;s++){ var A=q[s], Bq=q[(s+1)%q.length], bb=bul[s];
            if(bb){ var th=4*Math.atan(Math.abs(bb)), ch=Math.hypot(Bq[0]-A[0],Bq[1]-A[1]), r=ch/(2*Math.sin(th/2)), ccw=(bb>0)!==flip; d+=' A'+r.toFixed(1)+' '+r.toFixed(1)+' 0 '+(th>Math.PI?1:0)+' '+(ccw?0:1)+' '+X(Bq[0])+' '+Y(Bq[1]); }
            else d+=' L'+X(Bq[0])+' '+Y(Bq[1]); }
          if(t==='HATCH') out.push('<path d="'+d+'Z" fill="'+c+'" stroke="none"/>');
          else { var wd=gf(e,43,0)*sc; out.push('<path d="'+d+(closed?'Z':'')+'" fill="none" stroke="'+c+'" stroke-width="'+Math.max(sw,wd).toFixed(1)+'" stroke-linejoin="round"/>'); }
        }
        else if(t==='CIRCLE'){ var cc2=tp(gf(e,10),gf(e,20)); if(inBox(cc2[0],cc2[1])) out.push('<circle cx="'+X(cc2[0])+'" cy="'+Y(cc2[1])+'" r="'+(gf(e,40)*sc).toFixed(1)+'" fill="none" stroke="'+c+'" stroke-width="'+sw.toFixed(1)+'"/>'); }
        else if(t==='ARC'){
          var cx=gf(e,10),cy=gf(e,20),rr=gf(e,40),a0=gf(e,50)*Math.PI/180,a1=gf(e,51)*Math.PI/180; if(a1<a0) a1+=Math.PI*2;
          var p0=tp(cx+rr*Math.cos(a0),cy+rr*Math.sin(a0)), p1=tp(cx+rr*Math.cos(a1),cy+rr*Math.sin(a1));
          if(inBox(p0[0],p0[1])) out.push('<path d="M'+X(p0[0])+' '+Y(p0[1])+' A'+(rr*sc).toFixed(1)+' '+(rr*sc).toFixed(1)+' 0 '+(a1-a0>Math.PI?1:0)+' '+(flip?1:0)+' '+X(p1[0])+' '+Y(p1[1])+'" fill="none" stroke="'+c+'" stroke-width="'+sw.toFixed(1)+'"/>');
        }
        else if(t==='TEXT'||t==='ATTRIB'||t==='MTEXT'){
          if(t==='ATTRIB'&&(parseInt(g(e,70,'0'),10)&1)) continue;
          var s0=t==='MTEXT'?mtxt(e.filter(function(p){return p[0]===3;}).map(function(p){return p[1];}).join('')+(g(e,1)||'')):(g(e,1)||'');
          var ha=parseInt(g(e,72,'0'),10), va=parseInt(g(e,t==='TEXT'?73:74,'0'),10);
          var useAl=t!=='MTEXT'&&(ha||va), P=useAl?tp(gf(e,11),gf(e,21)):tp(gf(e,10),gf(e,20));
          if(!inBox(P[0],P[1])) continue;
          var h=gf(e,40)*sc, rot=t==='MTEXT'?(g(e,11)!=null?Math.atan2(gf(e,21),gf(e,11))*180/Math.PI:0)+rotM:gf(e,50)+rotM;
          var anc='start', bl='auto', lines=s0.split('\n');
          if(t==='MTEXT'){ var at=parseInt(g(e,71,'1'),10), colI=(at-1)%3, row=Math.floor((at-1)/3); anc=['start','middle','end'][colI]; bl=['hanging','central','auto'][row]; }
          else { anc=ha===1||ha===4?'middle':ha===2?'end':'start'; bl=va===3?'hanging':va===2||ha===4?'central':'auto'; }
          var wf=t==='MTEXT'?1:gf(e,41,1)||1;
          lines.forEach(function(ln,li){ out.push('<text transform="translate('+X(P[0])+' '+Y(P[1])+') rotate('+(-rot).toFixed(1)+')'+(wf!==1?' scale('+wf+' 1)':'')+'" y="'+(li*h*1.6).toFixed(1)+'" font-size="'+(h*1.3).toFixed(1)+'" fill="'+c+'" text-anchor="'+anc+'" dominant-baseline="'+bl+'">'+esc(ln)+'</text>'); });
        }
        else if(t==='INSERT'&&depth<6){
          var bk=Mdl.blocks[g(e,2)]; if(!bk) continue;
          var sx=gf(e,41,1), sy=gf(e,42,1), r2=gf(e,50)*Math.PI/180, ix=gf(e,10), iy=gf(e,20);
          var Lm=[sx*Math.cos(r2),-sy*Math.sin(r2),ix-(sx*Math.cos(r2)*bk.bx-sy*Math.sin(r2)*bk.by),sx*Math.sin(r2),sy*Math.cos(r2),iy-(sx*Math.sin(r2)*bk.bx+sy*Math.cos(r2)*bk.by)];
          var MM=[M[0]*Lm[0]+M[1]*Lm[3],M[0]*Lm[1]+M[1]*Lm[4],M[0]*Lm[2]+M[1]*Lm[5]+M[2],M[3]*Lm[0]+M[4]*Lm[3],M[3]*Lm[1]+M[4]*Lm[4],M[3]*Lm[2]+M[4]*Lm[5]+M[5]];
          var o0=tp(ix,iy); if(depth===0&&!(o0[0]>x0-25000&&o0[0]<x1+25000&&o0[1]>y0-20000&&o0[1]<y1+20000)) continue;
          draw(bk.ents,MM,c,depth+1);
        }
      }
    }
    draw(Mdl.ents,[1,0,0,0,1,0],'#111',0);
    out.push('</svg>');
    return out.join('');
  }
