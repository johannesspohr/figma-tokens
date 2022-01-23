import getAliasValue from '@/utils/aliases';
import {track} from '@/utils/analytics';
import checkIfContainsAlias from '@/utils/checkIfContainsAlias';
import * as React from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {ShadowTokenSingleValue} from 'Types/propertyTypes';
import {Dispatch, RootState} from '../store';
import useManageTokens from '../store/useManageTokens';
import BoxShadowInput from './BoxShadowInput';
import Input from './Input';
import ColorPicker from './ColorPicker';

const EditTokenForm = ({resolvedTokens}) => {
    const {activeTokenSet} = useSelector((state: RootState) => state.tokenState);
    const {editSingleToken, createSingleToken} = useManageTokens();
    const {editToken} = useSelector((state: RootState) => state.uiState);
    const dispatch = useDispatch<Dispatch>();
    const [inputHelperOpen, setInputHelperOpen] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [internalEditToken, setInternalEditToken] = React.useState<typeof editToken>(editToken);

    const isValid = React.useMemo(() => internalEditToken.value && !error, [internalEditToken, error]);

    const hasNameThatExistsAlready = React.useMemo(
        () =>
            resolvedTokens
                .filter((t) => t.internal__Parent === activeTokenSet)
                .find((t) => t.name === internalEditToken.name),
        [internalEditToken, resolvedTokens, activeTokenSet]
    );
    const nameWasChanged = React.useMemo(() => internalEditToken?.initialName !== internalEditToken.name, [
        internalEditToken,
    ]);

    React.useEffect(() => {
        if ((internalEditToken.isPristine || nameWasChanged) && hasNameThatExistsAlready) {
            setError('Token names must be unique');
        }
    }, [internalEditToken, hasNameThatExistsAlready, nameWasChanged]);

    const handleToggleInputHelper = React.useCallback(() => {
        setInputHelperOpen(!inputHelperOpen);
    }, [inputHelperOpen]);

    const handleChange = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>(
        (e) => {
            setError(null);
            e.persist();
            setInternalEditToken({...internalEditToken, [e.target.name]: e.target.value});
        },
        [internalEditToken]
    );

    const handleShadowChange = React.useCallback(
        (shadow: ShadowTokenSingleValue | ShadowTokenSingleValue[]) => {
            setError(null);
            setInternalEditToken({...internalEditToken, value: shadow});
        },
        [internalEditToken]
    );

    const handleColorValueChange = React.useCallback(
        (color: string) => {
            setError(null);
            setInternalEditToken({...internalEditToken, value: color});
        },
        [internalEditToken]
    );

    const handleObjectChange = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>(
        (e) => {
            e.persist();
            setInternalEditToken({
                ...internalEditToken,
                value: {...internalEditToken.value, [e.target.name]: e.target.value},
            });
        },
        [internalEditToken]
    );

    const handleOptionsChange = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>(
        (e) => {
            e.persist();
            setInternalEditToken({
                ...internalEditToken,
                options: {...internalEditToken.options, [e.target.name]: e.target.value},
            });
        },
        [internalEditToken]
    );

    const submitTokenValue = async ({value, name, options}) => {
        track('Edit Token');

        let oldName;
        if (internalEditToken.initialName !== name && internalEditToken.initialName) {
            oldName = internalEditToken.initialName;
        }
        const newName = name
            .split('/')
            .map((n) => n.trim())
            .join('.');
        if (internalEditToken.isPristine) {
            createSingleToken({
                parent: activeTokenSet,
                name: newName,
                value,
                options,
            });
        } else {
            editSingleToken({
                parent: activeTokenSet,
                name: newName,
                oldName,
                value,
                options,
            });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isValid) {
            submitTokenValue(internalEditToken);
            dispatch.uiState.setShowEditForm(false);
        }
    };

    const handleReset = () => {
        dispatch.uiState.setShowEditForm(false);
    };

    const firstInput: React.RefObject<HTMLInputElement> = React.useRef(null);

    React.useEffect(() => {
        setTimeout(() => {
            firstInput.current.focus();
        }, 50);
    }, []);

    const resolvedValue = React.useMemo(() => {
        return typeof internalEditToken.value === 'object'
            ? null
            : getAliasValue(internalEditToken.value, resolvedTokens);
    }, [internalEditToken, resolvedTokens]);

    const renderTokenForm = () => {
        switch (internalEditToken.type) {
            case 'boxShadow': {
                return <BoxShadowInput setValue={handleShadowChange} value={internalEditToken.value} />;
            }
            case 'typography': {
                return Object.entries(internalEditToken.schema).map(([key, schemaValue]: [string, string]) => (
                    <Input
                        key={key}
                        full
                        label={key}
                        value={internalEditToken.value[key]}
                        onChange={handleObjectChange}
                        type="text"
                        name={key}
                        custom={schemaValue}
                        required
                    />
                ));
            }
            default: {
                return (
                    <div>
                        <Input
                            full
                            label={internalEditToken.property}
                            value={internalEditToken.value}
                            onChange={handleChange}
                            type="text"
                            name="value"
                            required
                            custom={internalEditToken.schema}
                            placeholder={
                                internalEditToken.type === 'color'
                                    ? '#000000, hsla(), rgba() or {alias}'
                                    : 'Value or {alias}'
                            }
                            prefix={
                                internalEditToken.type === 'color' && (
                                    <button
                                        type="button"
                                        className="block w-4 h-4 rounded-sm cursor-pointer shadow-border shadow-gray-300 focus:shadow-focus focus:shadow-primary-400"
                                        style={{background: internalEditToken.value, fontSize: 0}}
                                        onClick={handleToggleInputHelper}
                                    >
                                        {internalEditToken.value}
                                    </button>
                                )
                            }
                        />
                        {inputHelperOpen && internalEditToken.type === 'color' && (
                            <ColorPicker value={internalEditToken.value} onChange={handleColorValueChange} />
                        )}
                        {checkIfContainsAlias(internalEditToken.value) && (
                            <div className="flex p-2 mt-2 font-mono text-gray-700 bg-gray-100 border-gray-300 rounded text-xxs itms-center">
                                {internalEditToken.type === 'color' ? (
                                    <div
                                        className="w-4 h-4 mr-1 border border-gray-200 rounded"
                                        style={{background: resolvedValue}}
                                    />
                                ) : null}
                                {resolvedValue}
                            </div>
                        )}
                    </div>
                );
            }
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col justify-start space-y-4">
            <Input
                required
                full
                label="Name"
                value={internalEditToken.name}
                onChange={handleChange}
                type="text"
                name="name"
                inputRef={firstInput}
                error={error}
                placeholder="Unique name"
            />
            {renderTokenForm()}

            {internalEditToken.explainer && (
                <div className="mt-1 text-gray-600 text-xxs">{internalEditToken.explainer}</div>
            )}
            {internalEditToken.optionsSchema
                ? Object.entries(internalEditToken.optionsSchema).map(([key, schemaValue]: [string, string]) => (
                      <Input
                          key={key}
                          full
                          label={key}
                          value={internalEditToken.options[key]}
                          onChange={handleOptionsChange}
                          type="text"
                          name={key}
                          custom={schemaValue}
                          capitalize
                      />
                  ))
                : null}
            <div className="flex justify-end space-x-2">
                <button className="button button-link" type="button" onClick={handleReset}>
                    Cancel
                </button>
                <button disabled={!isValid} className="button button-primary" type="submit">
                    {internalEditToken.isPristine ? 'Create' : 'Update'}
                </button>
            </div>
        </form>
    );
};

export default EditTokenForm;
