// Design document for memvid views
// Map views that emit each chunk with its vector and metadata

function(doc) {
  if (doc.vectors && doc.chunks) {
    for (var chunk_id in doc.vectors) {
      var chunkContent = "";
      if (Array.isArray(doc.chunks)) {
        for (var i = 0; i < doc.chunks.length; i++) {
          var chunk = doc.chunks[i];
          if (chunk && chunk.id === chunk_id) {
            chunkContent = chunk.content || "";
            break;
          }
        }
      }

      emit(doc.cognitive_load, {
        id: doc._id,
        chunk_id: chunk_id,
        vector: doc.vectors[chunk_id],
        cognitive_load: doc.cognitive_load,
        content: chunkContent
      });
    }
  }
}
