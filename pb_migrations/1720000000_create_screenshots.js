/// <reference path="../pb_data/types.d.ts" />

migrate((db) => {
  const collection = new Collection({
    "id": "screenshots",
    "name": "screenshots",
    "type": "base",
    "system": false,
    "schema": [
      {
        "id": "screenshot",
        "name": "screenshot",
        "type": "file",
        "system": false,
        "required": true,
        "options": {
          "maxSelect": 1,
          "maxSize": 5242880,
          "mimeTypes": [
            "image/png",
            "image/jpeg",
            "image/gif"
          ],
          "thumbs": ["200x200"]
        }
      },
      {
        "id": "device",
        "name": "device",
        "type": "relation",
        "system": false,
        "required": true,
        "options": {
          "collectionId": "devices",
          "cascadeDelete": true,
          "minSelect": null,
          "maxSelect": 1,
          "displayFields": ["name"]
        }
      },
      {
        "id": "timestamp",
        "name": "timestamp",
        "type": "date",
        "system": false,
        "required": true,
        "options": {
          "min": "",
          "max": ""
        }
      }
    ],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  return Dao(db).deleteCollection("screenshots");
});
