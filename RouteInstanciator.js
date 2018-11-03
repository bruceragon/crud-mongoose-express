const mongoose = require('mongoose');
const _unionWith = require('lodash/unionWith');
const _isEqual = require('lodash/isEqual');
const _differenceWith = require('lodash/differenceWith');

class RouteInstanciator {
    constructor() {
        if (!RouteInstanciator.instance) {
            this.paths = {
                get: {url: '/', verb: 'get'},
                getById: {url: '/:id', verb: 'get'},
                deleteById: {url: '/:id', verb: 'delete'},
                post: {url: '/', verb: 'post'},
                patch: {url: '/:id', verb: 'patch'},
                getRelation: {url: '/:id/:related', verb: 'get'},
                associate: {url: '/:id/:related', verb: 'post'},
                deleteAssociation: {url: '/:id/:related', verb: 'delete'},
                // getRelation: {url: '/:id/:name', verb: 'get', toReplace: ':name'},
                // associate: {url: '/:id/:name', verb: 'post', toReplace: ':name'},
                // deleteAssociation: {url: '/:id/:name', verb: 'delete', toReplace: ':name'},
            };
            this.models = [];
            this.relationships = [];
            RouteInstanciator.instance = this;
        }
        return RouteInstanciator.instance;
    }

    get(router, Model, prefix, Schema = null) {
        const url = prefix + this.url('get');
        this.registerRoute(Model, url, this.verb('get'));
        router[this.verb('get')](url, (req, res) => {
            let fields = this.getSelectedFields(req.query, Model);
            let modelKey = !prefix.includes('/') ? prefix : prefix.split('/')[prefix.split('/').length - 1];
            let included = this.getIncludedModel(req.query, Model, modelKey);
            let filters = this.getFilters(req.query, modelKey);
            let sortOrder = this.getSortOrder(req.query);
            let limit = req.query.hasOwnProperty('limit') ? parseInt(req.query['limit']) : null;
            let skip = req.query.hasOwnProperty('skip') ? parseInt(req.query['skip']) : null;
            const modelName = this.pluralize(Model);
            // console.log("Model", modelName);
            // console.log("FILTER IN GET", filters);
            let query = Model.find(filters, fields[modelName]);
            if (included.length > 0) {
                included.forEach(include => {
                    const relatedFields = fields.hasOwnProperty(include.key) ? fields[include.key] : '';
                    let relatedFilters = this.getFilters(req.query, include.key);
                    let relatedPopulate = {
                        path: include.key,
                        select: relatedFields,
                        match: relatedFilters,
                        populate: []
                    };
                    let deepIncluded = this.getIncludedModel(req.query, include.model, include.key);
                    deepIncluded.forEach(deepInclusion => {
                        let fieldName = include.key + '.' + deepInclusion.key;
                        let deepfields = this.getSelectedFields(req.query, deepInclusion.model, fieldName);
                        const deepRelatedFields = deepfields.hasOwnProperty(fieldName) ? deepfields[fieldName] : '';
                        let deeprelatedFilters = this.getFilters(req.query, deepInclusion.key);
                        let deeprelatedPopulate = {
                            path: deepInclusion.key,
                            select: deepRelatedFields,
                            match: deeprelatedFilters
                        };
                        relatedPopulate.populate.push(deeprelatedPopulate);
                    })
                    query.populate(relatedPopulate);
                });
            }
            query.skip(skip).limit(limit);
            query.sort(sortOrder);
            query.exec((err, results) => {
                if (err) {
                    res.status(500).send({status: 'error', errors: err, message: 'internal server error'});
                } else {
                    res.status(200).send({status: 'success', data: results, message: null});
                }
            });
        });
    }

    getById(router, Model, prefix, Schema = null) {
        const url = prefix + this.url('getById');
        this.registerRoute(Model, url, this.verb('getById'));
        router[this.verb('getById')](url, (req, res) => {
            let fields = this.getSelectedFields(req.query, Model);
            let modelKey = !prefix.includes('/') ? prefix : prefix.split('/')[prefix.split('/').length - 1];
            let included = this.getIncludedModel(req.query, Model, modelKey);
            const modelName = this.pluralize(Model);
            let query = Model.findById(req.params.id, fields[modelName]);
            //TODO: replace by recursive function
            if (included.length > 0) {
                included.forEach(include => {
                    const relatedFields = fields.hasOwnProperty(include.key) ? fields[include.key] : '';
                    let relatedFilters = this.getFilters(req.query, include.key);
                    let relatedPopulate = {
                        path: include.key,
                        select: relatedFields,
                        match: relatedFilters,
                        populate: []
                    };
                    let deepIncluded = this.getIncludedModel(req.query, include.model, include.key);
                    deepIncluded.forEach(deepInclusion => {
                        let fieldName = include.key + '.' + deepInclusion.key;
                        let deepfields = this.getSelectedFields(req.query, deepInclusion.model, fieldName);
                        const deepRelatedFields = deepfields.hasOwnProperty(fieldName) ? deepfields[fieldName] : '';
                        let deeprelatedFilters = this.getFilters(req.query, deepInclusion.key);
                        let deeprelatedPopulate = {
                            path: deepInclusion.key,
                            select: deepRelatedFields,
                            match: deeprelatedFilters
                        };
                        relatedPopulate.populate.push(deeprelatedPopulate);
                    })
                    query.populate(relatedPopulate);
                });
            }
            query.exec((err, result) => {
                if (err) {
                    res.status(500).send({status: 'error', errors: err, message: 'internal server error'});
                } else {
                    res.status(200).send({
                        status: 'success',
                        data: result,
                        message: result != null ? null : 'Data not found'
                    });
                }
            });
        });
    }

    deleteById(router, Model, prefix, Schema = null) {
        const url = prefix + this.url('deleteById');
        this.registerRoute(Model, url, this.verb('deleteById'));
        router[this.verb('deleteById')](url, (req, res) => {
            Model.findByIdAndDelete(req.params.id, (err, result) => {
                if (err) {
                    res.status(500).send({status: 'error', data: null, message: 'internal server error'});
                } else {
                    this.deleteRelatedReferences(Model, req.params.id, result, (err, finalResult) => {
                        res.status(200).send({
                            status: 'success',
                            data: finalResult,
                            message: result != null ? 'record deleted' : 'Data not found'
                        });
                    });
                }
            });
        });
    }

    post(router, Model, prefix, Schema) {
        const url = prefix + this.url('post');
        this.registerRoute(Model, url, this.verb('post'));
        router[this.verb('post')](url, (req, res) => {
            let data = {};
            for (let key in Schema) {
                if (Schema.hasOwnProperty(key)) {
                    data[key] = req.body[key];
                }
            }
            let newInstance = new Model(data);
            newInstance.save((err, savedItem) => {
                if (err) {
                    const errors = this.handleValidationErr(err);
                    res.status(500).send({status: 'error', errors: err, message: 'internal server error'});
                } else {
                    this.updateRelatedReferences(Model, data, savedItem, (finalErr, finalSave) => {
                        if (finalErr.length > 0) {
                            return res.status(500).send({
                                status: 'error',
                                errors: finalErr,
                                message: 'Error related to associations'
                            })
                        }
                        res.status(200).send({
                            status: 'success',
                            data: finalSave,
                            message: 'new ' + newInstance.constructor.modelName + ' created'
                        });
                    });
                }
            });
        });
    }

    patch(router, Model, prefix, Schema) {
        const url = prefix + this.url('patch');
        this.registerRoute(Model, url, this.verb('patch'));
        router[this.verb('patch')](url, (req, res) => {
            let data = {};
            for (let key in req.body) {
                if (Object.prototype.hasOwnProperty.call(req.body, key) && Schema.hasOwnProperty(key)) {
                    data[key] = req.body[key];
                }
            }
            this.patchRelatedReferences(Model, data, req.params.id, (responseArray, newData) => {
                Model.findByIdAndUpdate(req.params.id, {$set: newData}, {new: true}, function (err, updated) {
                    if (err) {
                        return res.status(500).send({status: 'error', errors: err, message: 'internal server error'});
                    } else {
                        if (responseArray.length == 0) {
                            return res.status(200).send({
                                status: 'success',
                                data: updated,
                                message: 'document updated'
                            });
                        }
                        responseArray.forEach((response, responseIndex) => {
                            let query = {};
                            if (response.relationshipType == 'OneToMany') {
                                query[response.foreignKey] = updated._id;
                            }
                            else if (response.relationshipType == 'ManyToOne' || response.relationshipType == 'ManyToMany') {
                                query = {'$addToSet': {}};
                                query['$addToSet'][response.foreignKey] = updated._id;
                            }
                            response.relatedModel.updateMany({'_id': {$in: response.added}}, query, (updateRelatedErr, raw) => {
                                if (updateRelatedErr) {
                                    return res.status(500).send({
                                        status: 'error',
                                        errors: updateRelatedErr,
                                        message: 'internal server error'
                                    });
                                }
                                query = {};
                                if (response.relationshipType == 'OneToMany') {
                                    query[response.foreignKey] = null;
                                }
                                else if (response.relationshipType == 'ManyToOne' || response.relationshipType == 'ManyToMany') {
                                    query = {'$pull': {}};
                                    query['$pull'][response.foreignKey] = updated._id;
                                }
                                response.relatedModel.updateMany({'_id': {$in: response.deleted}}, query, (updateRelatedErr2, raw2) => {
                                    if (updateRelatedErr) {
                                        return res.status(500).send({
                                            status: 'error',
                                            errors: updateRelatedErr2,
                                            message: 'internal server error'
                                        });
                                    }
                                    if (responseIndex == responseArray.length - 1) {
                                        return res.status(200).send({
                                            status: 'success',
                                            data: updated,
                                            message: 'document updated'
                                        });
                                    }
                                });
                            });
                        })
                    }
                });
            });
        });
    }

    getRelation(router, Model, prefix, schema) {
        const url = prefix + this.url('getRelation');
        router[this.verb('getRelation')](url, (req, res) => {
            let relationship = this.relationships.find(rel => rel.model == Model && rel.localKey == req.params.related);
            if (undefined === relationship) {
                return res.sendStatus(404);
            }
            const RelatedModel = relationship.relatedTo;
            const localKey = relationship.localKey;
            const foreignKey = relationship.foreignKey;
            let fields = this.getSelectedFields(req.query, RelatedModel, localKey);
            let included = this.getIncludedModel(req.query, RelatedModel, req.params.related);
            let filterKey = !prefix.includes('/') ? prefix : prefix.split('/')[prefix.split('/').length - 1];
            let filters = this.getFilters(req.query, filterKey);
            let query = Model.findById(req.params.id, localKey + ' -_id');
            let populate = {path: localKey, select: fields[localKey], match: filters, populate: []}
            if (included.length > 0) {
                included.forEach(include => {
                    const relatedFields = fields.hasOwnProperty(include.key) ? fields[include.key] : '';
                    let relatedFilters = this.getFilters(req.query, include.key);
                    const relatedPopulate = {
                        path: include.key,
                        select: relatedFields,
                        match: relatedFilters,
                        populate: []
                    };

                    let deepIncluded = this.getIncludedModel(req.query, include.model, include.key);
                    deepIncluded.forEach(deepInclusion => {
                        let fieldName = include.key + '.' + deepInclusion.key;
                        let deepfields = this.getSelectedFields(req.query, deepInclusion.model, fieldName);
                        const deepRelatedFields = deepfields.hasOwnProperty(fieldName) ? deepfields[fieldName] : '';
                        let deeprelatedFilters = this.getFilters(req.query, deepInclusion.key);
                        let deeprelatedPopulate = {
                            path: deepInclusion.key,
                            select: deepRelatedFields,
                            match: deeprelatedFilters
                        };
                        relatedPopulate.populate.push(deeprelatedPopulate);
                    })
                    populate['populate'].push(relatedPopulate);
                });
            }
            query.populate(populate);
            query.exec(function (err, related) {
                if (err) {
                    if (err.hasOwnProperty('path') && err['path'] == '_id') {
                        return res.status(404).send({
                            status: 'error',
                            data: null,
                            message: relationship['model']['name'] + ' with id ' + req.params.id + ' does not exist.'
                        });
                    }
                    res.status(500).send({status: 'error', err: err, message: 'internal server error'});
                } else {
                    res.status(200).send({status: 'success', data: related[localKey], message: null});
                }
            });
        });
    }

    associate(router, Model, prefix, schema) {
        const url = prefix + this.url('associate');
        router[this.verb('associate')](url, (req, res) => {
            let relationship = this.relationships.find(rel => rel.model == Model && rel.localKey == req.params.related);
            if (undefined === relationship) {
                return res.sendStatus(404);
            }
            const RelatedModel = relationship.relatedTo;
            const localKey = relationship.localKey;
            const foreignKey = relationship.foreignKey;
            let reverseRelationship = this.getRelationship(RelatedModel, Model, foreignKey);
            if (undefined === reverseRelationship) {
                return res.sendStatus(500);
            }
            let relationshipType = this.getRelationshipType(relationship.relation, reverseRelationship.relation);
            if (null === relationshipType) {
                return res.sendStatus(500);
            }
            if (Object.prototype.hasOwnProperty.call(req.body, localKey)
                && Array.isArray(req.body[localKey])) {
                Model.findById(req.params.id, (errFindModel, instance) => {
                    if (errFindModel) {
                        return res.status(500).send({
                            status: 'error',
                            data: {errFindModel},
                            message: 'internal server error'
                        });
                    }
                    if (instance == null) {
                        return res.status(404).send({
                            status: 'error',
                            data: null,
                            message: relationship.modelName + ' with id ' + req.params.id + ' does not exist.'
                        });
                    }
                    RelatedModel.find({'_id': {$in: req.body[localKey]}}, (errFindRelated, relatedObjects) => {
                        if (errFindRelated) {
                            return res.status(500).send({
                                status: 'error',
                                errors: errFindRelated,
                                message: 'internal server error'
                            });
                        }
                        if (relatedObjects.length < 1) {
                            return res.status(400).send({status: 'error', data: null, message: 'no record found'});
                        }
                        let updatedDocs = [];
                        relatedObjects.forEach((related, i) => {
                            if (relationship.relation != 'HasOne' || (relationship.relation == 'HasOne' && i < 1)) {
                                updatedDocs.push(related._id);
                            }
                        })
                        let query = {};
                        if (relationshipType == 'OneToMany') {
                            query[foreignKey] = req.params.id;
                            instance[localKey] = _unionWith(instance[localKey], updatedDocs, _isEqual);
                        }
                        else if (relationshipType == 'ManyToOne') {
                            query = {'$addToSet': {}};
                            query['$addToSet'][foreignKey] = req.params.id;
                            instance[localKey] = updatedDocs[0];
                        }
                        else if (relationshipType == 'ManyToMany') {
                            query = {'$addToSet': {}};
                            query['$addToSet'][foreignKey] = req.params.id;
                            instance[localKey] = _unionWith(instance[localKey], updatedDocs, _isEqual);
                        }
                        RelatedModel.updateMany({'_id': {$in: updatedDocs}}, query, (updateRelatedErr, raw) => {
                            if (updateRelatedErr) {
                                return res.status(500).send({
                                    status: 'error',
                                    errors: updateRelatedErr,
                                    message: 'internal server error'
                                });
                            }
                            instance.save((saveInstanceError, savedInstance) => {
                                if (saveInstanceError) {
                                    return res.status(500).send({
                                        status: 'error',
                                        errors: saveInstanceError,
                                        message: 'internal server error'
                                    });
                                }
                                const msg = 'successfully associated ' + updatedDocs.length + ' ' + localKey + '(' + this.pluralize(RelatedModel) + ') to ' + relationship.modelName + ' with id ' + req.params.id;
                                res.status(200).send({status: 'success', data: {savedInstance}, message: msg});
                            })
                        })
                    });
                })
            } else {
                res.status(400).send({status: 'error', data: null, message: 'Bad Request. Wrong or missing fields.'});
            }
        });
    }

    deleteAssociation(router, Model, prefix, schema) {
        const url = prefix + this.url('deleteAssociation');
        router[this.verb('deleteAssociation')](url, (req, res) => {
            let relationship = this.relationships.find(rel => rel.model == Model && rel.localKey == req.params.related);
            if (undefined === relationship) {
                return res.sendStatus(404);
            }
            const RelatedModel = relationship.relatedTo;
            const localKey = relationship.localKey;
            const foreignKey = relationship.foreignKey;
            let reverseRelationship = this.getRelationship(RelatedModel, Model, foreignKey);
            if (undefined === reverseRelationship) {
                return res.sendStatus(500);
            }
            let relationshipType = this.getRelationshipType(relationship.relation, reverseRelationship.relation);
            if (null === relationshipType) {
                return res.sendStatus(500);
            }
            if (Object.prototype.hasOwnProperty.call(req.body, localKey)
                && Array.isArray(req.body[localKey])) {
                Model.findById(req.params.id, (errFindModel, instance) => {
                    if (errFindModel) {
                        return res.status(500).send({
                            status: 'error',
                            errors: errFindModel,
                            message: 'internal server error'
                        });
                    }
                    if (instance == null) {
                        return res.status(404).send({
                            status: 'error',
                            data: null,
                            message: relationship.modelName + ' with id ' + req.params.id + ' does not exist.'
                        });
                    }
                    RelatedModel.find({'_id': {$in: req.body[localKey]}}, (errFindRelated, relatedObjects) => {
                        if (errFindRelated) {
                            return res.status(500).send({
                                status: 'error',
                                errors: errFindRelated,
                                message: 'internal server error'
                            });
                        }
                        if (relatedObjects.length < 1) {
                            return res.status(400).send({status: 'error', data: null, message: 'no association found'});
                        }
                        let updatedDocs = [];
                        relatedObjects.forEach((related, i) => {
                            if (relationship.relation != 'HasOne' || (relationship.relation == 'HasOne' && i < 1)) {
                                updatedDocs.push(related._id);
                            }
                        })
                        let query = {};
                        if (relationshipType == 'OneToMany') {
                            query[foreignKey] = null;
                            instance[localKey] = _differenceWith(instance[localKey], updatedDocs, _isEqual);
                        }
                        else if (relationshipType == 'ManyToOne') {
                            query = {'$pull': {}};
                            query['$pull'][foreignKey] = req.params.id;
                            instance[localKey] = null;
                        }
                        else if (relationshipType == 'ManyToMany') {
                            query = {'$pull': {}};
                            query['$pull'][foreignKey] = req.params.id;
                            instance[localKey] = _differenceWith(instance[localKey], updatedDocs, _isEqual);
                        }
                        RelatedModel.updateMany({'_id': {$in: updatedDocs}}, query, (updateRelatedErr, raw) => {
                            if (updateRelatedErr) {
                                return res.status(500).send({
                                    status: 'error',
                                    errors: updateRelatedErr,
                                    message: 'internal server error'
                                });
                            }
                            instance.save((saveInstanceError, savedInstance) => {
                                if (saveInstanceError) {
                                    return res.status(500).send({
                                        status: 'error',
                                        errors: saveInstanceError,
                                        message: 'internal server error'
                                    });
                                }
                                const msg = 'successfully removed ' + updatedDocs.length + ' ' + localKey + '(' + this.pluralize(RelatedModel) + ') from ' + relationship.modelName + ' with id ' + req.params.id;
                                res.status(200).send({status: 'success', data: {savedInstance}, message: msg});
                            })
                        })
                    });
                })
            } else {
                res.status(400).send({status: 'error', data: null, message: 'Bad Request. Wrong or missing fields.'});
            }
        });
    }

    url(fn) {
        return this['paths'][fn].url;
    }

    verb(fn) {
        return this['paths'][fn].verb;
    }

    pluralize(Model, isString = false) {
        if (isString) {
            const pluralize = mongoose.pluralize();
            return pluralize(Model);
        } else {
            const instance = new Model();
            const modelName = instance.constructor.modelName;
            const pluralize = mongoose.pluralize();
            return pluralize(modelName);
        }
    }

    handleValidationErr(err) {
        const errors = {};
        for (let field in err['errors']) {
            if (err['errors'].hasOwnProperty(field)) {
                const error = err['errors'][field];
                if (!errors.hasOwnProperty(error.kind)) {
                    errors[error.kind] = [];
                }
                errors[error.kind].push(error.path);
            }
        }
        return errors;
    }

    registerRoute(Model, url, verb, related = null) {
        let i = this.models.findIndex(x => x.model === Model);
        if (i === -1) {
            const model = {
                model: Model,
                routes: [],
                relations: []
            };
            this.models.push(model);
            i = this.models.length - 1;
        }
        const route = verb + ': ' + url;
        let y = this.models[i].routes.indexOf(route);
        if (y === -1) {
            this.models[i].routes.push(route);
        }
        if (null != related) {
            this.models[i].relations.push(related);
        }
    }

    getRoutesByModel(Model) {
        const model = this.models.find(x => x.model === Model);
        if (model !== undefined) {
            return model.routes;
        } else {
            return null;
        }
    }

    routesList(router, params) {
        let prefix = '';
        let url = '/mcrud/routes';
        if (params != null && params.hasOwnProperty('prefix') && params.prefix !== '') {
            prefix = '/' + params.prefix;
        }
        url = prefix + url;
        if (params != null && params.hasOwnProperty('url') && params.url !== '') {
            if (params.url.charAt(0) !== '/') {
                params.url = '/' + params.url;
            }
            url = params.url;
        }
        let routes = [];
        this.models.forEach(model => {
            routes = routes.concat(model.routes);
        });
        router.get(url, (req, res) => {
            res.status(200).send({status: 'success', data: {routes}, message: null});
        });
    }

    getSelectedFields(urlParams, Model, relationName = '') {
        let fields = {};
        const pluralized = relationName != '' ? relationName : this.pluralize(Model);
        if (urlParams.hasOwnProperty('fields')) {
            if (typeof urlParams['fields'] == 'object') {
                if (urlParams['fields'].hasOwnProperty(pluralized)) {
                    fields[pluralized] = urlParams['fields'][pluralized];
                }
                const relationships = this.relationships.filter(rel => rel.model == Model);
                relationships.forEach(rel => {
                    if (urlParams['fields'].hasOwnProperty(rel.localKey)) {
                        fields[rel.localKey] = urlParams['fields'][rel.localKey].replace(/,/g, ' ');
                    }
                });
            } else if (typeof urlParams['fields'] == 'string') {
                fields[pluralized] = urlParams['fields'].replace(/,/g, ' ');
            }
        }
        return fields;
    }

    getIncludedModel(urlParams, Model, modelKey) {
        let included = [];
        if (urlParams.hasOwnProperty('include')) {
            if (typeof urlParams['include'] === 'string') {
                let includeArray = urlParams['include'].split(',');
                const relationships = this.relationships.filter((rel) => rel.model == Model && includeArray.indexOf(rel.localKey) != -1);
                relationships.forEach(rel => {
                    included.push({key: rel.localKey, model: rel.relatedTo});
                })
            }
            if (typeof urlParams['include'] === 'object') {
                for (let key in urlParams['include']) {
                    if (key == modelKey) {
                        let includeArray = urlParams['include'][key].split(',');
                        const relationships = this.relationships.filter((rel) => rel.model == Model && includeArray.indexOf(rel.localKey) != -1);
                        relationships.forEach(rel => {
                            included.push({key: rel.localKey, model: rel.relatedTo});
                        })
                    }
                }
            }
        }
        return included;
    }

    getSortOrder(urlParams) {
        let sortOrder = '';
        for (const paramName in urlParams) {
            if (urlParams.hasOwnProperty(paramName)) {
                if (paramName === 'sort') {
                    sortOrder = urlParams[paramName].replace(',', ' ');
                }
            }
        }
        return sortOrder;
    }

    isRelated(Model, relation) {
        let refs = [];
        for (let key in Model) {
            if (Model.hasOwnProperty(key)) {
                if (
                    (Model[key].hasOwnProperty('schemaName') && Model[key]['schemaName'] === 'ObjectId')
                    ||
                    (Model[key].hasOwnProperty('type') && Model[key].type.hasOwnProperty('schemaName')
                        && Model[key].type.schemaName === 'ObjectId')
                ) {
                    refs.push({pluralized: this.pluralize(Model[key].ref, true), modelName: Model[key].ref});
                } else if ((Array.isArray(Model[key]) && Model[key].length > 0
                    && Model[key][0].hasOwnProperty('type')
                    && Model[key][0].type.hasOwnProperty('schemaName')
                    && Model[key][0].type.schemaName === 'ObjectId')) {
                    refs.push({pluralized: this.pluralize(Model[key][0].ref, true), modelName: Model[key][0].ref});
                }
            }
        }
        let found = refs.find(ref => ref.pluralized == relation);
        return found;
    }

    getRelationshipDetails(Model, RelatedModel, ref) {
        const pluralizedModelName = this.pluralize(Model);
        const modelInstance = new Model();
        const modelName = modelInstance.constructor.modelName.toLowerCase();

        const pluralizedRelatedName = this.pluralize(RelatedModel);
        const relatedInstance = new RelatedModel();
        const relatedName = relatedInstance.constructor.modelName.toLowerCase();

        let relationship = {};
        relationship['model'] = Model;
        relationship['modelName'] = modelName;
        relationship['relatedTo'] = RelatedModel;
        relationship['relatedToName'] = relatedName;
        relationship['localKey'] = ref.localKey;
        relationship['foreignKey'] = ref.foreignKey;
        relationship['relation'] = ref.relation;

        return relationship;
    }

    saveRelationships(option, refs) {
        const Model = option.Model;
        refs.forEach(reference => {
            let ref = reference.ref;
            if (mongoose.models.hasOwnProperty(ref)) {
                const RelatedModel = mongoose.models[ref];
                const relationship = this.getRelationshipDetails(Model, RelatedModel, reference);
                if (undefined === this.getRelationship(Model, RelatedModel, reference.localKey)) {
                    this.relationships.push(relationship);
                }
            }
        })
    }

    getRelationship(Model, RelatedModel, localKey) {
        return this.relationships.find(x => x.model == Model && x.relatedTo == RelatedModel && x.localKey == localKey);
    }

    getRelationshipType(modelRelation, relatedRelation) {
        let relation = null;
        if (modelRelation == 'HasMany' && relatedRelation == 'HasMany') {
            relation = 'ManyToMany';
        }
        if (modelRelation == 'HasMany' && relatedRelation == 'HasOne') {
            relation = 'OneToMany';
        }
        if (modelRelation == 'HasOne' && relatedRelation == 'HasMany') {
            relation = 'ManyToOne';
        }
        return relation;
    }

    getLocalKeys(Model, RelatedModel) {
        let keys = [];
        const relationships = this.relationships.filter(x => x.model == Model && x.relatedTo == RelatedModel);
        relationships.forEach(rel => {
            keys.push(rel.localKey);
        })
    }

    deleteRelatedReferences(Model, id, result, callback) {
        const foundRelationships = this.relationships.filter(x => x.model == Model);
        let errors = [];
        let finalResult = result;
        foundRelationships.forEach((relationship, relationshipIndex) => {
            const localKey = relationship.localKey;
            const foreignKey = relationship.foreignKey;
            const RelatedModel = relationship.relatedTo;
            let reverseRelationship = this.getRelationship(RelatedModel, Model, foreignKey);
            if (undefined === reverseRelationship) {
                return res.sendStatus(500);
            }
            let relationshipType = this.getRelationshipType(relationship.relation, reverseRelationship.relation);
            if (null === relationshipType) {
                return res.sendStatus(500);
            }
            const findQuery = {};
            findQuery[foreignKey] = id;
            RelatedModel.find(findQuery, (errFindRelated, relatedObjects) => {
                if (errFindRelated) {
                    errors.push({status: 'error', errors: errFindRelated, message: 'internal server error'});
                }
                if (relatedObjects.length < 1) {
                    // return res.status(400).send({status: 'error', data: null, message: 'no record found'});
                }
                let updatedDocs = [];
                relatedObjects.forEach((related, i) => {
                    updatedDocs.push(related._id);
                })
                let query = {};
                if (relationshipType == 'OneToMany') {
                    query[foreignKey] = null;
                }
                else if (relationshipType == 'ManyToOne') {
                    query = {'$pull': {}};
                    query['$pull'][foreignKey] = id;
                }
                else if (relationshipType == 'ManyToMany') {
                    query = {'$pull': {}};
                    query['$pull'][foreignKey] = id;
                }
                RelatedModel.updateMany({'_id': {$in: updatedDocs}}, query, (updateRelatedErr, raw) => {
                    if (updateRelatedErr) {
                        errors.push({status: 'error', errors: updateRelatedErr, message: 'internal server error'});
                    }
                })
            })
            if (relationshipIndex == foundRelationships.length - 1) {
                finalResult = result;
            }
        })
        callback(errors, finalResult);
    }

    patchRelatedReferences(Model, data, id, callback) {
        const foundRelationships = this.relationships.filter(x => x.model == Model);
        let responseArray = [];
        if (foundRelationships.length == 0) {
            callback(responseArray, data);
            return;
        } else {
            let relationshipToUpdate = [];
            foundRelationships.forEach((relationship, relationshipIndex) => {
                const localKey = relationship.localKey;
                const foreignKey = relationship.foreignKey;
                if (data.hasOwnProperty(localKey)
                    && data[localKey] !== undefined
                    && (typeof data[localKey] == 'string' || Array.isArray(data[localKey]) || data[localKey] === null)
                ) {
                    relationshipToUpdate.push(relationship);
                }
            });
            if (relationshipToUpdate.length == 0) {
                callback(responseArray, data);
                return;
            }
            relationshipToUpdate.forEach((relationship, relationshipIndex) => {
                const localKey = relationship.localKey;
                const foreignKey = relationship.foreignKey;
                Model.findById(id, (err, instance) => {
                    if (err) {
                        return res.status(500).send({status: 'error', errors: err, message: 'internal server error'});
                    } else {
                        if (instance == null) {
                            return res.status(200).send({
                                status: 'success',
                                data: result,
                                message: result != null ? null : 'Data not found'
                            });
                        }
                        const RelatedModel = relationship.relatedTo;
                        let reverseRelationship = this.getRelationship(RelatedModel, Model, foreignKey);
                        if (undefined === reverseRelationship) {
                            return res.sendStatus(500);
                        }
                        let relationshipType = this.getRelationshipType(relationship.relation, reverseRelationship.relation);
                        if (null === relationshipType) {
                            return res.sendStatus(500);
                        }
                        let _in = null;
                        if (relationshipType == 'ManyToOne') {
                            _in = typeof data[localKey] == 'string' ? [data[localKey]] : instance[localKey];
                        } else {
                            _in = data[localKey];
                        }
                        if (_in === null) {
                            _in = [];
                        }
                        RelatedModel.find({'_id': {$in: _in}}, (errFindRelated, relatedObjects) => {
                            if (errFindRelated) {
                                return res.status(500).send({
                                    status: 'error',
                                    errors: errFindRelated,
                                    message: 'internal server error'
                                });
                            }
                            let existingRelatedDocs = [];
                            relatedObjects.forEach((related, i) => {
                                if (relationship.relation != 'HasOne' || (relationship.relation == 'HasOne' && i < 1) && _in.length > 0) {
                                    existingRelatedDocs.push(related._id);
                                }
                            });
                            let response = {
                                relatedModel: relationship.relatedTo,
                                relationshipType: relationshipType,
                                foreignKey: foreignKey,
                                added: [],
                                deleted: []
                            }
                            let oldVal, newVal;
                            if (relationshipType === 'ManyToOne') {
                                oldVal = instance[localKey];
                                newVal = _in.length > 0 ? existingRelatedDocs : null;
                                response.deleted = newVal != oldVal ? [oldVal] : [newVal];
                                response.added = newVal != null && typeof newVal == 'string' ? [newVal] : newVal;
                                response.deleted = _differenceWith(response.deleted, response.added, _isEqual);
                                ;
                            }
                            if (relationshipType === 'OneToMany' || relationshipType === 'ManyToMany') {
                                oldVal = instance[localKey] == null ? [] : instance[localKey];
                                newVal = _in.length > 0 ? existingRelatedDocs : [];
                                response.deleted = _differenceWith(oldVal, newVal, _isEqual);
                                response.added = _differenceWith(newVal, oldVal, _isEqual);
                            }
                            responseArray.push(response);
                            data[localKey] = newVal;
                            if (relationshipIndex == relationshipToUpdate.length - 1) {
                                callback(responseArray, data);
                            }
                        })
                    }
                })
            });
        }
    }

    updateRelatedReferences(Model, data, savedInstance, callback) {
        const foundRelationships = this.relationships.filter(x => x.model == Model);
        let errors = [];
        let finalSave = savedInstance;
        foundRelationships.forEach((relationship, relationshipIndex) => {
            const localKey = relationship.localKey;
            const foreignKey = relationship.foreignKey;
            if (data.hasOwnProperty(localKey)
                && data[localKey] !== undefined
                && data[localKey] !== null
                && (typeof data[localKey] == 'string' || Array.isArray(data[localKey]))
            ) {
                const ids = Array.isArray(data[localKey]) ? data[localKey] : [data[localKey]];
                const RelatedModel = relationship.relatedTo;
                let reverseRelationship = this.getRelationship(RelatedModel, Model, foreignKey);
                if (undefined === reverseRelationship) {
                    return res.sendStatus(500);
                }
                let relationshipType = this.getRelationshipType(relationship.relation, reverseRelationship.relation);
                if (null === relationshipType) {
                    return res.sendStatus(500);
                }
                RelatedModel.find({'_id': {$in: ids}}, (errFindRelated, relatedObjects) => {
                    if (errFindRelated) {
                        errors.push({status: 'error', errors: errFindRelated, message: 'internal server error'});
                    }
                    if (relatedObjects.length < 1) {
                        // return res.status(400).send({status: 'error', data: null, message: 'no record found'});
                    }
                    let updatedDocs = [];
                    relatedObjects.forEach((related, i) => {
                        if (relationship.relation != 'HasOne' || (relationship.relation == 'HasOne' && i < 1)) {
                            updatedDocs.push(related._id);
                        }
                    })
                    let query = {};
                    if (relationshipType == 'OneToMany') {
                        query[foreignKey] = savedInstance._id;
                    }
                    else if (relationshipType == 'ManyToOne') {
                        query = {'$addToSet': {}};
                        query['$addToSet'][foreignKey] = savedInstance._id;
                    }
                    else if (relationshipType == 'ManyToMany') {
                        query = {'$addToSet': {}};
                        query['$addToSet'][foreignKey] = savedInstance._id;
                    }
                    RelatedModel.updateMany({'_id': {$in: updatedDocs}}, query, (updateRelatedErr, raw) => {
                        if (updateRelatedErr) {
                            errors.push({status: 'error', errors: updateRelatedErr, message: 'internal server error'});
                        }
                        if (updatedDocs.length != ids.length) {
                            savedInstance[localKey] = Array.isArray(data[localKey]) ? updatedDocs : null;
                            savedInstance.save((errSaveNewInstance, saved) => {
                                if (errSaveNewInstance) {
                                    errors.push({
                                        status: 'error',
                                        errors: updateRelatedErr,
                                        message: 'internal server error'
                                    });
                                }
                                if (relationshipIndex == foundRelationships.length - 1) {
                                    finalSave = saved;
                                }
                            })
                        }
                    })
                })
            }
        })
        callback(errors, finalSave);
    }

    getFilters(urlQuery, localKey) {
        let filters = {};
        if (urlQuery.hasOwnProperty('filter')) {
            const filterObj = urlQuery['filter'];
            if (typeof filterObj == 'string') {
                let filterStr = filterObj;
                let query = {};
                const strRgxAndOr = 'or\\b|and\\b';
                let rgxAndOr = new RegExp(strRgxAndOr);
                if ((!rgxAndOr.test(filterStr)) || (rgxAndOr.test(filterStr) && filterStr.includes('('))) {
                    let conditions = {stringQuery: filterStr, conditions: [], operator: '', isLeaf: false};
                    this.getConditions(filterStr, conditions);
                    let query = {};
                    this.getQueryFromConditions(conditions, query);
                    return query;
                }
            } else if (typeof filterObj == 'object') {
                for (let model in filterObj) {
                    if (model == localKey) {
                        let filterStr = filterObj[model];
                        let query = {};
                        const strRgxAndOr = 'or\\b|and\\b';
                        let rgxAndOr = new RegExp(strRgxAndOr);
                        if ((!rgxAndOr.test(filterStr)) || (rgxAndOr.test(filterStr) && filterStr.includes('('))) {
                            let conditions = {stringQuery: filterStr, conditions: [], operator: '', isLeaf: false};
                            this.getConditions(filterStr, conditions);
                            let query = {};
                            this.getQueryFromConditions(conditions, query);
                            return query;
                        }
                    }
                }
            }
        }
    }

    getConditions(filterStr, conditions) {
        // console.log('in get conditions', filterStr);
        while (filterStr != '') {
            let n = this.countFollowingChar('(', filterStr);
            let regexStr = '(^\\({' + n + '}.*?\\){' + n + '})';
            let regex = new RegExp(regexStr, 'g');
            let matches = filterStr.match(regex);
            if (matches !== null && matches[0] != '') {
                filterStr = filterStr.substring(matches[0].length);
                filterStr = filterStr.trim();
                let exploded = filterStr.split(" ");
                let operator = exploded.length > 0 ? exploded[0] : null;
                if (operator != null) {
                    filterStr = filterStr.substring(operator.length + 1);
                }
                conditions.operator = conditions.operator == '' ? operator : conditions.operator;
                conditions.isLeaf = false;
                if (matches[0].charAt(0) == '(' && matches[0].charAt(matches[0].length - 1) == ')') {
                    matches[0] = matches[0].substring(1, matches[0].length - 1);
                }
                let childConditions = {stringQuery: matches[0], conditions: [], operator: '', isLeaf: false};
                conditions.conditions.push(childConditions);
            } else {
                let str = conditions.stringQuery;
                while (str != '') {
                    const strRgx = '(\\S*\'.*\'|\\S+)';
                    let rgx = new RegExp(strRgx, 'g');
                    let exploded = str.match(rgx);
                    if (exploded.length > 3) {
                        let childConditions = {
                            stringQuery: exploded[0] + ' ' + exploded[1] + ' ' + exploded[2],
                            conditions: [exploded[0], exploded[2]],
                            operator: exploded[1],
                            isLeaf: true
                        };
                        conditions.conditions.push(childConditions);
                        str = str.substring(childConditions.stringQuery.length);
                        str = str.trim();
                        let operator = str.split(' ')[0];
                        conditions.operator = conditions.operator == '' ? operator : conditions.operator;
                        conditions.isLeaf = false;
                        str = str.substring(operator.length + 1);
                    } else {
                        conditions.conditions = [exploded[0], exploded[2]];
                        conditions.operator = exploded[1];
                        conditions.isLeaf = true;
                        break;
                    }
                }
                break;
            }
        }
        if (!conditions.isLeaf) {
            conditions.conditions.forEach(condition => {
                if (!condition.isLeaf) {
                    this.getConditions(condition.stringQuery, condition);
                }
            });
        }
    }

    getQueryFromConditions(conditions, query) {
        let operator = '$' + conditions.operator.toLowerCase();
        // console.log("conditions", conditions);
        if (operator == '$or' || operator == '$and') {
            query[operator] = [];
            conditions.conditions.forEach((condition, i) => {
                query[operator].push({});
                this.getQueryFromConditions(condition, query[operator][i]);
            })
        } else {
            // console.log('OPERATOR', operator);
            const supportedOperators = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$nearsphere'];
            if (supportedOperators.indexOf(operator) != -1) {
                const property = conditions.conditions[0];
                const strRgxSpecialKey = '(\\S*)\'(.*)\'';
                const rgxSpecialKey = new RegExp(strRgxSpecialKey, 'g');
                const specialKeyFound = rgxSpecialKey.exec(conditions.conditions[1]);
                const specialKey = specialKeyFound != null ? specialKeyFound[1] : null;
                let valueToSearch = specialKey != null ? specialKeyFound[2] : conditions.conditions[1];
                query[property] = {};
                if (specialKey != null) {
                    if (specialKey === 'guid') {
                        // valueToSearch = mongoose.Types.ObjectId(valueToSearch);
                    }
                }
                if (operator == '$in' || operator == '$nin' || operator == '$nearsphere') {
                    valueToSearch = valueToSearch.split(',');
                }
                if (operator == '$nearsphere') {
                    // query = {};
                    if (valueToSearch.length < 3) {
                        // query = {};
                    } else {
                        query[property] = {};
                        const lat = valueToSearch[0];
                        const lng = valueToSearch[1];
                        const maxRadius = valueToSearch[2];
                        const minRadius = valueToSearch.length > 3 ? valueToSearch[3] : 0;
                        query[property]["$nearSphere"] = {
                            $geometry: {
                                type: "Point",
                                coordinates: [lat, lng]
                            },
                            $minDistance: minRadius,
                            $maxDistance: maxRadius
                        }
                    }
                } else {
                    query[property][operator] = valueToSearch;
                }

                // console.log("QUERY IN FILTER", query);
            }
        }
    }

    countFollowingChar(char, str) {
        let n = 0;
        let max = 0;
        for (let c in str) {
            if (str[c] == char) {
                n++;
                if (max < n) {
                    max = n;
                }
            } else {
                n = 0;
            }
        }
        return max;
    }

    /** Legacy **/
    // _getRelation(router, Model, RelatedModel, prefix) {
    //     const relatedInstance = new RelatedModel();
    //     const relatedName = relatedInstance.constructor.modelName.toLowerCase();
    //     const idKey = relatedName + 'Id';
    //     const pluralizedName = this.pluralize(RelatedModel); //localKey
    //     const url = prefix + '/:id/' + pluralizedName;
    //     let toPopulate = pluralizedName; //localKey
    //     this.registerRoute(Model, url, this.verb('getRelation'), RelatedModel);
    //     router[this.verb('getRelation')](url, (req, res) => {
    //         let fields = this.getSelectedFields(req.query, RelatedModel);
    //         let modelName = RelatedModel.modelName.toString().toLowerCase(); // relationship['relatedModel']['name']
    //         if (Model.schema.obj.hasOwnProperty(idKey)) { // ManyToOne
    //             toPopulate = idKey; //foreignKey
    //             modelName = relatedName;
    //         }
    //         Model.findById(req.params.id, toPopulate + ' -_id')
    //             .populate(toPopulate, fields[modelName])
    //             .exec(function (err, related) {
    //                 if (err) {
    //                     res.status(500).send({status: 'error', data: {err}, message: 'internal server error'});
    //                 } else {
    //                     res.status(200).send({status: 'success', data: related[toPopulate], message: null});
    //                 }
    //             });
    //     });
    // }

    /** Legacy **/
    // _deleteAssociation(router, Model, RelatedModel, prefix) {
    //     const pluralizedName = this.pluralize(RelatedModel);
    //     const pluralizedModelName = this.pluralize(Model);
    //     const url = prefix + '/:id/' + pluralizedName;
    //     const relatedInstance = new RelatedModel();
    //     const relatedName = relatedInstance.constructor.modelName.toLowerCase();
    //     const idKey = relatedName + 'Id';
    //     const modelInstance = new Model();
    //     const modelName = modelInstance.constructor.modelName.toLowerCase();
    //     const modelIdKey = modelName + 'Id';
    //     const that = this;
    //     this.registerRoute(Model, url, this.verb('deleteAssociation'), RelatedModel);
    //     router[this.verb('deleteAssociation')](url, (req, res) => {
    //         if (Object.prototype.hasOwnProperty.call(req.body, idKey)) {
    //             RelatedModel.findById(req.body[idKey], function (err, related) {
    //                 if (err) {
    //                     const errors = that.handleValidationErr(err);
    //                     res.status(400).send({status: 'error', data: {errors}, message: 'Bad request'});
    //                 } else {
    //                     if (related === null) {
    //                         res.status(200).send({
    //                             status: 'error',
    //                             data: null,
    //                             message: relatedName + ' with id ' + req.body[idKey] + ' not found'
    //                         });
    //                     } else {
    //                         Model.findById(req.params.id, function (err2, instance) {
    //                             if (err2 || instance == null) {
    //                                 res.status(400).send({status: 'error', data: null, message: 'Bad request'});
    //                             }
    //                             if (Model.schema.obj.hasOwnProperty(pluralizedName)) {
    //                                 let index = instance[pluralizedName].indexOf(req.body[idKey]);
    //                                 if (index > -1) {
    //                                     instance[pluralizedName].splice(index, 1);
    //                                     if (RelatedModel.schema.obj.hasOwnProperty(modelIdKey)) {
    //                                         related[modelIdKey] = null;
    //                                         related.save((err4, savedRelated) => {
    //                                             if (err4) {
    //                                                 return res.sendStatus(500);
    //                                             }
    //                                         })
    //                                     }
    //                                     instance.save((err3, savedInstance) => {
    //                                         if (err3) {
    //                                             const errors = this.handleValidationErr(err2);
    //                                             res.status(500).send({
    //                                                 status: 'error',
    //                                                 data: {errors},
    //                                                 message: 'internal server error'
    //                                             });
    //                                         }
    //                                         const modelName = savedInstance.constructor.modelName.toLowerCase();
    //                                         const msg = 'successfully remove ' + relatedName + ' with id ' + req.body[idKey] + ' from ' + modelName + ' with id ' + req.params.id;
    //                                         res.status(200).send({status: 'success', data: {savedInstance}, message: msg});
    //                                     });
    //                                 } else {
    //                                     res.status(200).send({
    //                                         status: 'error',
    //                                         data: null,
    //                                         message: relatedName + ' with id ' + req.body[idKey] + ' not assciated with ' + req.params.id
    //                                     });
    //                                 }
    //                             }
    //                             else if (Model.schema.obj.hasOwnProperty(idKey)) {
    //                                 if (instance[idKey].toString() == related._id.toString()) {
    //                                     instance[idKey] = null;
    //                                     if (RelatedModel.schema.obj.hasOwnProperty(pluralizedModelName)) {
    //                                         let index = related[pluralizedModelName].indexOf(instance._id);
    //                                         if (index > -1) {
    //                                             related[pluralizedModelName].splice(index, 1);
    //                                         }
    //                                         related.save((err4, savedRelated) => {
    //                                             if (err4) {
    //                                                 return res.sendStatus(500);
    //                                             }
    //                                         })
    //                                     }
    //                                     instance.save((err3, savedInstance) => {
    //                                         if (err3) {
    //                                             const errors = this.handleValidationErr(err2);
    //                                             res.status(500).send({
    //                                                 status: 'error',
    //                                                 data: {errors},
    //                                                 message: 'internal server error'
    //                                             });
    //                                         }
    //                                         const modelName = savedInstance.constructor.modelName.toLowerCase();
    //                                         const msg = 'successfully remove ' + relatedName + ' with id ' + req.body[idKey] + ' from ' + modelName + ' with id ' + req.params.id;
    //                                         res.status(200).send({status: 'success', data: {savedInstance}, message: msg});
    //                                     });
    //                                 } else {
    //                                     res.status(200).send({
    //                                         status: 'error',
    //                                         data: null,
    //                                         message: relatedName + ' with id ' + req.body[idKey] + ' not assciated with ' + req.params.id
    //                                     });
    //                                 }
    //                             }
    //                         })
    //                     }
    //                 }
    //             })
    //         } else {
    //             res.status(200).send({status: 'error', data: null, message: 'missing field'});
    //         }
    //     });
    // }

    /** Legacy **/
    // _associate(router, Model, RelatedModel, prefix) {
    //     const pluralizedName = this.pluralize(RelatedModel);
    //     const pluralizedModelName = this.pluralize(Model);
    //     const url = prefix + '/:id/' + pluralizedName;
    //     const relatedInstance = new RelatedModel();
    //     const modelInstance = new Model();
    //     const relatedName = relatedInstance.constructor.modelName.toLowerCase();
    //     const modelName = modelInstance.constructor.modelName.toLowerCase();
    //     const idKey = relatedName + 'Id';
    //     const modelIdKey = modelName + 'Id';
    //     const that = this;
    //     this.registerRoute(Model, url, this.verb('associate'), RelatedModel);
    //     router[this.verb('associate')](url, (req, res) => {
    //         if (Object.prototype.hasOwnProperty.call(req.body, idKey)) {
    //             RelatedModel.findById(req.body[idKey], function (err, related) {
    //                 if (err) {
    //                     const errors = that.handleValidationErr(err);
    //                     res.status(400).send({status: 'error', data: {errors}, message: 'Bad request'});
    //                 } else {
    //                     if (related == null) {
    //                         res.status(200).send({
    //                             status: 'error',
    //                             data: null,
    //                             message: relatedName + ' with id ' + req.body[idKey] + ' not found'
    //                         });
    //                     } else {
    //                         Model.findById(req.params.id, function (err2, instance) {
    //                             if (err2) {
    //                                 const errors = this.handleValidationErr(err2);
    //                                 res.status(500).send({
    //                                     status: 'error',
    //                                     data: {errors},
    //                                     message: 'internal server error'
    //                                 });
    //                             }
    //                             if (Model.schema.obj.hasOwnProperty(pluralizedName)) {
    //                                 instance[pluralizedName].push(related._id);
    //                                 if (RelatedModel.schema.obj.hasOwnProperty(modelIdKey)) {
    //                                     related[modelIdKey] = instance._id;
    //                                     related.save((err4, savedRelated) => {
    //                                         if (err4) {
    //                                             return res.sendStatus(500);
    //                                         }
    //                                     });
    //                                 }
    //                             }
    //                             else if (Model.schema.obj.hasOwnProperty(idKey)) {
    //                                 instance[idKey] = related._id;
    //                                 if (RelatedModel.schema.obj.hasOwnProperty(pluralizedModelName)) {
    //                                     related[pluralizedModelName].push(instance._id);
    //                                     related.save((err4, savedRelated) => {
    //                                         if (err4) {
    //                                             return res.sendStatus(500);
    //                                         }
    //                                     })
    //                                 }
    //                             }
    //                             instance.save((err3, savedInstance) => {
    //                                 if (err3) {
    //                                     const errors = this.handleValidationErr(err2);
    //                                     res.status(500).send({
    //                                         status: 'error',
    //                                         data: {errors},
    //                                         message: 'internal server error'
    //                                     });
    //                                 }
    //                                 const modelName = savedInstance.constructor.modelName.toLowerCase();
    //                                 const msg = 'successfully add a ' + relatedName + ' with id ' + req.body[idKey] + ' to ' + modelName + ' with id ' + req.params.id;
    //                                 res.status(200).send({status: 'success', data: {savedInstance}, message: msg});
    //                             });
    //                         })
    //                     }
    //                 }
    //             });
    //         } else {
    //             res.status(200).send({status: 'error', data: null, message: 'missing field'});
    //         }
    //     });
    // }
}

const instance = new RouteInstanciator();
Object.freeze(RouteInstanciator);

module.exports = instance;