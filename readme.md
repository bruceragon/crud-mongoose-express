
# crud-mongoose-express  
  
This package allows to generate CRUD routes in a Mongoose/Express app.  
  
## Installation  
  
 npm install crud-mongoose-express  
## Usage  
```javascript  
const express = require('express');
const router = express.Router();
const basicCrud = require('crud-mongoose-express');
...  
app.use(basicCrud.make(router, basicCrudOptions)); 
```  

the ``make()`` function returns a router and take 2 mandatory arguments:  
  
 - an Express router instance  
 - an array of object or an object (explained below)  
   

To handle relations between models you have to add a **foreignKey** attribute in your Model: 
```javascript    
const productSchema = mongoose.Schema({  
  stores: [{type: mongoose.Schema.Types.ObjectId, ref: 'Store', foreignKey: 'products'}],   
  name: {type: String, required: true, unique: true},  
  type: {type: String, required: true},  
});

const storeSchema = mongoose.Schema({  
  products: [{type: mongoose.Schema.Types.ObjectId, ref: 'Product', foreignKey: 'stores'}],   
  name: {type: String, required: true, unique: true},  
  address: {type: String, required: true},  
  phone: {type: String, required: true},  
});
```

For each model in the option array, the following routes  will be generated:  
  
> Note
>**{prefix}** corresponds to the value you pass to the basicCrudOptions object and is the pluralized name of the model by default  
> **{related}** corresponds to the local key of a reference in the schema (for example with the 2 schemas above, in the StoreSchema {related} could be equals to "products")
  
|Route name  |Verb  |Url  |Definition |Parameters|  
|--|--|--|--|--|  
|get  |GET  |/{prefix}  |Get all documents of a collection |**include**={related}<br> **fields**=fieldname1,fieldname2...<br> **fields[{related}]**=fieldname1,fieldname2...<br> **sort**=fieldname1,... or -fieldname1...<br> **limit**=number<br> **skip**=number <br> **filter**= string (OData query) <br> **filter[{related}]**= string (OData query) <br> e.g: <br> mydomain.com/products?filter=type%20eq%20%27beverage%27&fields=name&include=stores&fields[stores]=name <br>
|getById  |GET|/{prefix}/:id|Get document by id|**include**={related},<br> **fields**=fieldname1,fieldname2...|  
|post  |POST|/{prefix}  |Create new document|POST data: {fieldname1: value1, ..}|  
|patch|PATCH|/{prefix}/:id|Update a document|POST data: {fieldname1: value1, ..}|  
|delete  |DELETE|{prefix}/:id|Delete a document ||  

the following routes will be generated if the model contains a reference to another one:  
> Note: **{related}** corresponds to the local key of a reference in the schema (for example with the 2 schemas above, in the StoreSchema {related} could be equals to "products")
  
|Route name  |Verb  |Url  |Definition |Parameters|  
|--|--|--|--|--|  
|getRelation  |GET|{prefix}/:id/{related}|get the documents associated to the document with :id|**include**={related}<br>**fields[{related}]**=fieldname1,fieldname2... <br> **filter[{related}]**= string (OData query) <br> e.g: <br> mydomain.com/products/1/stores?include=stocks&fields[stocks]=quantity&fields[stores]=name,stocks <br>|  
|associate  |POST|{prefix}/:id/{related}  |associate a document with another| {related} : Array <br> e.g: <br>mydomain.com/products/1/stores <br>**Payload**: { stores: [1, 2, 3] }
|deleteAssociation|DELETE|{prefix}/:id/{related}  |remove document association |same as above|  
  
## Exemple 1  
```javascript  
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const basicCrud = require('crud-mongoose-express');  
//Mongoose Models 
const Product = require('./models/Product');
const Shop = require('./models/Shop');   
//An object containing middlewares to apply to the generated routes  
const authMiddlewares = require('./routes/middlewares/authorization'); 
...  
...  
const basicCrudOptions = [
    {
        Model: Product,    
        middlewares: {    
                'deleteById, patch': authMiddlewares.isOwner(Product)    
        }    
    },    
    {    
        Model: Shop,    
        middlewares: {    
                'deleteById, patch, associate': authMiddlewares.isOwner(Shop)    
        }    
    }  
];  

app.use(basicCrud.make(router, basicCrudOptions));
app.listen(port);  
```  
## Exemple 2  
  
You can also use it in a separated route definition file  
  
**app.js**  
```javascript  
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const userRoutes = require('./routes/user.js');

const app = express();
mongoose.connect('mongodb://localhost/myapp');    

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());    

app.use('/users', userRoutes );
app.listen(port);  
```  
**/routes/user.js**  
```javascript  
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const basicCrud = require('crud-mongoose-express');
const authMiddlewares = require('./middlewares/authorization'); 

//Implement your own POST method (to register a user for example) 
router.post('/', function (req, res) {    
...  
});  
//add any route you want to (here signIn for example)
router.post('/signIn', (req, res) => {    
...  
});

const basicCrudOptions = { 
    Model: User,
    middlewares: {
        'getById, deleteById, patch': authMiddlewares.isOwner(User),    
        'get': authMiddlewares.isAdmin()    
    },    
    disableRoutes: ['post'], // as we re-implemented it we have to disable the default one   
    prefix: '' // as we set the prefix in the app.js file, we set it to empty here  
};  
  
basicCrud.make(router, basicCrudOptions);
module.exports = router;  
```  
  
## BasicCrudOptions (object):  
  
|Key  |Type  | Definition |    
|--|--|--|  
|Model  |Mongoose model  |  |  
|middlewares  |Object|Comma separated names of the routes as key and middleware to apply as value |  
|disableRoutes|Array of strings| names of the routes to disable  |   
|prefix|String|override the prefix used for the route. Pluralized model name is used by default (for  example Product -> products)  |  
  
  
## Extra Options  
You can pass an object as third parameter to the `make()` function. For the moment there is only one extra option and you can use it like this:  
```javascript  
const extra = { 
    endpoints: {    
	    routes: {    
	        enabled: true,    
	        params: {url: '/mcrud/routes'}    
	    }    
    }
};
    
basicCrud.make(router, basicCrudOptions, extra);  
```  
this option creates an extra route accessible by default at ``yourApp/mcrud/routes`` (or at the value passed to params['url']).  
This route lists all the routes that were created with crud-mongoose-express.  
  
> Note: if you prefixed the routes with app.use( "prefix", routes), as in Example 2, the prefix won't appear in the routes list.  
  
available parameters are: **url** or **prefix** (which add a prefix to ``/mcrud/routes``). If you set both, prefix will be ignored.
