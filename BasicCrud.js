const routeInstanciator = require('./RouteInstanciator');
const mongoose = require('mongoose');

class BasicCrud {
    constructor(){
        if(! BasicCrud.instance){
            this.routeInstanciator = routeInstanciator;
            this.extra = {
              endpoints: {
                  routes: {
                      action: this.initRoutesEndpoint,
                      params: {prefix: null, url: null}
                  }
              }
            };
            BasicCrud.instance = this;
        }
        return BasicCrud.instance;
    }
    initExtraFunctions(option, existingOptions, router) {
        for (let key in option) {
            if (existingOptions.hasOwnProperty(key)) {
                if (typeof existingOptions[key] === 'object' && !existingOptions[key].hasOwnProperty('action')) {
                    this.initExtraFunctions(option[key], existingOptions[key], router);
                } else {
                    if ((option[key].hasOwnProperty('enabled') && option[key].enabled)
                        && existingOptions[key].hasOwnProperty('action')
                        && typeof existingOptions[key].action === 'function') {
                        const params = option[key].hasOwnProperty('params') ? option[key].params : null;
                        existingOptions[key].action(router, params);
                    }
                }
            }
        }
    }
    make(router, options, extra = null) {
        if (Array.isArray(options)) {
            options.forEach(option => {
                if (option.hasOwnProperty('Model') && option.Model.hasOwnProperty('schema')) {
                    this.initRoutes(router, option);
                }
            });
        } else {
            this.initRoutes(router, options);
        }
        if (extra != null) {
            this.initExtraFunctions(extra, this.extra, router);
        }
        return router;
    }
    initRoutes(router, option) {
        const Model = option.Model.schema.obj;
        const refs = this.getModelsReferences(Model);
        this.initMiddlewares(router, option);
        // if (refs.length > 0) {
            this.routeInstanciator.saveRelationships(option, refs);
        //     this.initRoutesWithReferences(router, option, refs);
        // } else {
            this.initSimpleRoutes(router, option);
        // }
    }
    initMiddlewares(router, option, relatedModel = null) {
        const middlewares = option.hasOwnProperty('middlewares') ? option.middlewares : null;
        const prefix = this.getPrefix(option);
        if (middlewares != null) {
            for (let fns in middlewares) {
                const fnsArray = fns.split(',');
                fnsArray.forEach(fn => {
                    fn = fn.trim();
                    if (this.routeInstanciator.paths.hasOwnProperty(fn)) {
                        const path = this.routeInstanciator.paths[fn];
                        let url = prefix + path.url;
                        const verb = path.verb;
                        // const isDynamic = path.hasOwnProperty('toReplace');
                        // if (!isDynamic && relatedModel === null) {
                            router.route(url)[verb](middlewares[fns]);
                        // }
                        // if (isDynamic && relatedModel != null) {
                        //     const replace = this.routeInstanciator.pluralize(relatedModel);
                        //     url = url.replace(path.toReplace, replace);
                        //     router.route(url)[verb](middlewares[fns]);
                        // }
                    }
                });
            }
        }
    }
    getPrefix(option) {
        if (option.hasOwnProperty('prefix') && typeof option.prefix === 'string') {
            if (option.prefix === '') {
                return option.prefix;
            } else {
                return '/' + option.prefix;
            }
        } else {
            const plural = this.routeInstanciator.pluralize(option.Model);
            return '/' + plural;
        }
    }
    initSimpleRoutes(router, option) {
        const Model = option.Model;
        const Schema = Model.schema.obj;
        const prefix = this.getPrefix(option);
        const disabled = option.hasOwnProperty('disableRoutes') ? option.disableRoutes : [];
        for (const methodName in this.routeInstanciator.paths) {
            if (this.routeInstanciator.paths.hasOwnProperty(methodName)) {
                const path = this.routeInstanciator.paths[methodName];
                // if (!path.hasOwnProperty('toReplace') && disabled.indexOf(methodName) === -1) {
                if (disabled.indexOf(methodName) === -1) {
                    this.routeInstanciator[methodName](router, Model, prefix, Schema);
                }
                // }
            }
        }
    }
    // initRoutesWithReferences(router, option, refs) {
    //     this.initSimpleRoutes(router, option);
    //     const Model = option.Model;
    //     const prefix = this.getPrefix(option);
    //     const disabled = option.hasOwnProperty('disableRoutes') ? option.disableRoutes : [];
    //     for (const methodName in this.routeInstanciator.paths) {
    //         if (this.routeInstanciator.paths.hasOwnProperty(methodName)) {
    //             const path = this.routeInstanciator.paths[methodName];
    //             if (path.hasOwnProperty('toReplace') && disabled.indexOf(methodName) === -1) {
    //                 for (let modelName in mongoose.models) {
    //                     const index = refs.indexOf(modelName);
    //                     if (index > -1) {
    //                         const relatedModel = mongoose.models[modelName];
    //                         this.initMiddlewares(router, option, relatedModel);
    //                         this.routeInstanciator[methodName](router, Model, relatedModel, prefix);
    //                     }
    //                 }
    //             }
    //         }
    //     }
    // }
    getModelsReferences(Model) {
        let refs = [];
        for (let key in Model) {
            if (Model.hasOwnProperty(key)) {
                if (
                    (Model[key].hasOwnProperty('schemaName') && Model[key]['schemaName'] === 'ObjectId')
                    ||
                    (Model[key].hasOwnProperty('type') && Model[key].type.hasOwnProperty('schemaName')
                        && Model[key].type.schemaName === 'ObjectId')
                ) {
                    refs.push({
                        ref: Model[key].ref,
                        foreignKey: Model[key].foreignKey,
                        localKey: key,
                        relation: 'HasOne'
                    });
                } else if ((Array.isArray(Model[key]) && Model[key].length > 0
                    && Model[key][0].hasOwnProperty('type')
                    && Model[key][0].type.hasOwnProperty('schemaName')
                    && Model[key][0].type.schemaName === 'ObjectId')) {
                    refs.push({
                        ref: Model[key][0].ref,
                        foreignKey: Model[key][0].foreignKey,
                        localKey: key,
                        relation: 'HasMany'
                    });
                }
            }
        }
        return refs;
    }
    routes() {
        return this.routeInstanciator.models;
    }
    initRoutesEndpoint(router, params) {
        routeInstanciator.routesList(router, params);
    }
}

const instance = new BasicCrud();
Object.freeze(BasicCrud);

module.exports = instance;