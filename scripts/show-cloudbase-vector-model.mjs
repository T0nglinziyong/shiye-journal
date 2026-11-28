// Run only where server-side embedding configuration is already installed.
// Prints an identifier, never the endpoint, API key, or a SQL command with secrets.
import {embeddingConfiguration} from '../server/cloudbase/embeddings.mjs';
try{
 const config=embeddingConfiguration(process.env);
 if(!config)throw Error('not configured');
 console.log(JSON.stringify({modelKey:config.modelKey,dimensions:config.dimensions,version:config.version}));
}catch{
 console.error('Vector model is not fully configured. No model request was made and no credentials were printed.');
 process.exitCode=2;
}
