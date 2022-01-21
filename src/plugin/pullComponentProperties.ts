import {ComponentPart} from '@/app/store/models/tokenState';
import {getPage} from '@figma-plugin/helpers';
import defaultTokens from '../config/default.json';

export const pullComponentProperties = () => {
    const res: ComponentPart = {parts: {}, variants: {}, baseStyles: {}};
    const nodes = figma.currentPage.findAll((n) => n.getPluginDataKeys().includes('componentState'));
    for (const node of nodes) {
        const componentState = JSON.parse(node.getPluginData('componentState'));
        const {key, variant} = componentState;
        const keyParts = key.split('.');
        var target = res;
        for (const part of keyParts) {
            if (!target.parts[part]) {
                target.parts[part] = {
                    baseStyles: {},
                    variants: {},
                    parts: {},
                };
            }
            target = target.parts[part];
        }
        var tokens = gatherTokens(node);
        if (variant) {
            if (!target.variants[variant]) {
                target.variants[variant] = {};
            }
            Object.assign(target.variants[variant], tokens);
        } else {
            Object.assign(target.baseStyles, tokens);
        }
    }
    dedupeVariants(res);

    console.log(res.parts);
    return res.parts;
};

function dedupeVariants(part: ComponentPart) {
    for (const variant of Object.values(part.variants)) {
        for (const key of Object.keys(variant)) {
            if (variant[key] === part.baseStyles[key]) {
                console.log('Deleting...', key);
                delete variant[key];
            }
        }
    }
    for (const child of Object.values(part.parts)) {
        dedupeVariants(child);
    }
}

function gatherTokens(node: BaseNode) {
    const setTokens = node.getPluginDataKeys();
    const tokens = {} as Record<string, string>;
    for (const token of setTokens) {
        if (token !== 'componentState') {
            tokens[token] = stripTokenPrefix(token, JSON.parse(node.getPluginData(token)));
        }
    }
    Object.assign(tokens, findTextStyles(node));
    return tokens;
}

function findTextStyles(node: SceneNode) {
    const res = {} as Record<string, string>;
    if (hasChildren(node)) {
        for (const child of node.children) {
            if (child.getPluginData('componentState')?.role) {
                continue;
            }
            if (isTextNode(child)) {
                var color = child.getPluginData('fill');
                if (color) {
                    res.textColor = JSON.parse(color);
                }
            } else {
                Object.assign(res, findTextStyles(child as any));
            }
        }
    }
    return res;
}

function isTextNode(node: SceneNode): node is TextNode {
    return node.type === 'TEXT';
}

function hasChildren(node: SceneNode): node is SceneNode & ChildrenMixin {
    return !!node['children'];
}

function stripTokenPrefix(property: string, value: string) {
    var res = value;
    for (const key in defaultTokens.global) {
        if (res.startsWith(key + '.')) {
            res = res.replace(key + '.', '');
        }
    }
    return res;
}
