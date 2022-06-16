import { useState } from 'react';

function App() {
    const [calc, setCalc] = useState("");
    const [result, setResult] = useState("");

    const ops = ["+","-","*","/","."];

    const updateCalc = value => {
        if (
            (ops.includes(value) && calc === '') || (
            ops.includes(value) && ops.includes(calc.slice(-1)))
        ){
            return;
        }
        setCalc(calc + value);

        if (!ops.includes(value)){
            setResult(eval(calc + value).toString());
        }
    }
    const createDigits = () => {
        const digits = [];
        const alpha = ['one','two','three','four','five','six','seven','eight','nine'];
        for(let i = 1; i < 10; i++){
            digits.push(
                <button id={alpha[i-1]} onClick={()=> updateCalc(i.toString())}key={i}>{i}</button>
            )
        }
        return digits;
    }

    const calculate = () => {
        setCalc(eval(calc).toString());
    }

    const deletelast = () => {
        if(calc === ''){
            return;
        }
        const value = calc.slice(0,-1);
        setCalc(value);
    }

    const clearAll = () => {
        if(calc === ''){
            return;
        }
        const value = calc.slice(0,-(calc.length));
        setCalc(value);
        setResult(value);
    }

    return (
    <div className='App'>
        <div className='calculator'>
        <h2 className='text-center'>Calculator</h2>
            <div className='display' id='display'>
                <div className='plc2'>
                { calc || "0" }
                </div>
                <div className='plc1'>
                {result ? <span>Ans: {result}</span> : ""}
                </div>
            </div>
            <div className='operators'>

                <button id='add' onClick={()=> updateCalc('+')}>+</button>
                <button id='subtract' onClick={()=> updateCalc('-')}>-</button>
                <button id='multiply' onClick={()=> updateCalc('*')}>x</button>
                <button id='divide' onClick={()=> updateCalc('/')}>/</button>
                <button id="delete" onClick={deletelast}>DEL</button>
                <button id="clear" onClick={clearAll}>CLR</button>
            </div>
            <div className='digits'>
                { createDigits() }
                <button id="zero" onClick={()=> updateCalc('')}>0</button>
                <button id='decimal' onClick={()=> updateCalc('.')}>.</button>

                <button id="equals" onClick={calculate}>=</button>
            </div>
        </div>
    </div>
    );
}

export default App;
