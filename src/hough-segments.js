// HoughLinesP stores CV_32SC4 line vectors. Browser OpenCV can expose
// them as 1xN or Nx1 Mats, so Mat.rows is NOT the number of lines.
// data32S is contiguous x1,y1,x2,y2 tuples in either orientation.
export function unpackHoughSegments(mat){
  const values=mat?.data32S;
  if(!values||!ArrayBuffer.isView(values)||values.length%4!==0){
    throw Error('HoughLinesP returned an invalid line buffer (expected groups of 4 int32 coordinates)');
  }
  const lines=[];
  for(let offset=0;offset<values.length;offset+=4){
    lines.push([values[offset],values[offset+1],values[offset+2],values[offset+3]]);
  }
  return lines;
}
