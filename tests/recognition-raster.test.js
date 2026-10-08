import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import cvModule from '@techstark/opencv-js';
import {decode} from '../src/vendor/jpeg-decoder.js';
import {processVision} from '../src/opencv-worker.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
test('JPEG input and area resize have pinned RGBA output',async()=>{
  const bytes=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAQDAwMDAgQDAwMEBAQFBgoGBgUFBgwICQcKDgwPDg4MDQ0PERYTDxAVEQ0NExoTFRcYGRkZDxIbHRsYHRYYGRj/2wBDAQQEBAYFBgsGBgsYEA0QGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBj/wAARCAAMABADAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyfwB8Lf8AVf6N6dqEzy8q4i21PpHSPh2mm+DL69cG32WzBZVyCrkbVII6fMRz2rtwcoKtGVVpRWrbskorVtt6WSTbufUZ1xisBkmKxHtHFqElFq91KS5Y2tqnzNWfTfTcvaXZ2eheAtX1u0tYnuLDT57qJZRlGaONmAYDBxkDOCKzyvDxxWMo4eb0nKKdt7NpaH4FwnOeMx+HwtSTUZzjF23s5JO2+up4d8UPin418YfDfUdJvdU+waVcLC0lhpq+RGwLhCrNy7oRklWYqSenAx1cc5fQyvOMLllCN4cnO29XKV52v9n3eVONktdXd2t/XGZ8HZXlXDGJxFKnz1I8lpT95/xYNNL4U10aimkt9Xf/2Q==','base64');
  const decoded=decode(bytes,{useTArray:true});
  assert.deepEqual([decoded.width,decoded.height],[16,12]);
  assert.equal(digest(decoded.data),'9db2ff8d3b38f0d18ed5fd05e78084c37d2dcd0692c9746d8ba45ab4bb106ae4');
  const cv=await cvModule;
  const frame=await processVision(cv,'resize',{
    pixels:decoded.data,sourceWidth:16,sourceHeight:12,
    x:2,y:1,cropWidth:12,cropHeight:10,width:7,height:6
  });
  assert.equal(digest(frame.pixels),'ca70a3bf36e03b8f2b8943fd0559c354e282d36a8d6d281c7f0ccb76b65d0f87');
});
