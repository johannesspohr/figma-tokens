import * as React from 'react';
import {useDispatch, useSelector} from 'react-redux';
import {RootState, Dispatch} from '../store';
import useTokens from '../store/useTokens';
import Checkbox from './Checkbox';
import Label from './Label';
import Heading from './Heading';
import Input from './Input';

export const ComponentEditor: React.FC<{}> = (props) => {
    const {selectionValues, disabled, selectionId} = useSelector((state: RootState) => state.uiState);
    const dispatch = useDispatch<Dispatch>();

    const {setNodeData} = useTokens();

    const [key, setKey] = React.useState<string>();
    const [variant, setVariant] = React.useState<string>();
    const [componentType, setComponentType] = React.useState<string>();

    const isComponent = componentType === 'parent';

    React.useEffect(() => {
        setKey(selectionValues.componentState?.key || '');
        setVariant(selectionValues.componentState?.variant || '');
        setComponentType(selectionValues.componentState?.role || '');
    }, [selectionId]);

    const isValid = !isComponent || key;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isValid) {
            setNodeData(
                {
                    componentState: {
                        role: componentType,
                        key,
                        variant: variant !== '' ? variant : undefined,
                    },
                },
                undefined
            );
            dispatch.uiState.setLoading(true);
        }
    };

    /*const setComponentState = React.useCallback((key: string, value: string) => {
        
    }, [setNodeData])

    const setComponentMode = React.useCallback((e: CheckboxPrimitive.CheckedState) => {
        setComponentState("role", e ? "parent" : undefined);
    }, [setComponentState]);

    const handleInputUpdate = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        console.log(e.target.name, e.target.value);
        setComponentState(e.target.name, e.target.value);
    }, [setComponentState]);

    console.log("selection", selectionId);*/

    return (
        <div className="flex flex-col grow">
            <form onSubmit={handleSubmit} className="p-4 space-y-4 flex flex-col justify-start">
                <Heading>Component Properties</Heading>
                <div className="flex items-center space-x-2">
                    <Checkbox
                        checked={isComponent}
                        id={'role'}
                        onCheckedChange={(e) => setComponentType(e ? 'parent' : undefined)}
                        disabled={disabled}
                    />
                    <Label htmlFor={'role'}>Read Component Properties</Label>
                </div>
                {isComponent && !disabled && (
                    <>
                        <div>
                            <Input
                                full={true}
                                name="key"
                                label="Component Name"
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                            />
                            <p className="text-xxs text-gray-600 pt-2">
                                You can use dot to denote component hierarchies , e.g.{' '}
                                <code className="font-mono rounded-sm p-1 bg-gray-100">Dropdown.Item</code>.
                            </p>
                        </div>
                        <div>
                            <Input
                                full={true}
                                name="variant"
                                label="Variant Key"
                                value={variant}
                                onChange={(e) => setVariant(e.target.value)}
                            />
                            <p className="text-xxs text-gray-600 pt-2">
                                If set, this component styles will be handled as a variant to the main component.
                            </p>
                        </div>
                    </>
                )}
                <div className="flex space-x-2 justify-end">
                    <button disabled={!isValid} className="button button-primary" type="submit">
                        Update
                    </button>
                </div>
            </form>
        </div>
    );
};
