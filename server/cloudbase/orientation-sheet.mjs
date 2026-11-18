import sharp from 'sharp';

const rotations=[0,270,90,180];
export async function orientationSheet(imageURL){
  const match=/^data:image\/(?:jpeg|png|webp);base64,(.+)$/s.exec(imageURL||'');
  if(!match)return null;
  const source=Buffer.from(match[1],'base64');
  const metadata=await sharp(source,{limitInputPixels:16_000_000}).metadata();
  if(!metadata.width||!metadata.height)return null;
  const normalized=await sharp(source,{limitInputPixels:16_000_000})
    .resize(352,352,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
  const panels=await Promise.all(rotations.map(async angle=>{
    const turned=await sharp(normalized).rotate(angle).png().toBuffer();
    return sharp(turned).resize(352,352,{fit:'contain',background:'#ffffff'})
      .flatten({background:'#ffffff'}).png().toBuffer();
  }));
  const labels=Buffer.from('<svg width="760" height="800" xmlns="http://www.w3.org/2000/svg"><g fill="#202820" font-size="23" font-family="Arial,sans-serif"><text x="18" y="30">A: 0</text><text x="398" y="30">B: CCW 90</text><text x="18" y="430">C: CW 90</text><text x="398" y="430">D: 180</text></g></svg>');
  const sheet=await sharp({create:{width:760,height:800,channels:3,background:'#ffffff'}})
    .composite([{input:panels[0],left:14,top:44},{input:panels[1],left:394,top:44},
      {input:panels[2],left:14,top:444},{input:panels[3],left:394,top:444},
      {input:labels,left:0,top:0}]).jpeg({quality:80}).toBuffer();
  return `data:image/jpeg;base64,${sheet.toString('base64')}`;
}
